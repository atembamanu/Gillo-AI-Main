# Accuracy & Scale Strategy: Self-Hosted AI for Global Use

This document outlines how to achieve high extraction accuracy and scale the system to serve many users reliably.

---

## 1. Accuracy: What We Do Today

- **Bucket fields + ai_description**: Each field has a human or AI-generated description (with examples) so the model knows what to extract.
- **System message**: Instructions and field definitions are sent as Ollama `system` for better adherence.
- **Structured output**: Model is instructed to return only the listed keys; we normalize "Not found" and filter keys.
- **Few-shot from corrections** (implemented): When users click "Update" and save, we store `(input_text, corrected_output)` in `ai_interactions`. The worker loads recent corrections for the same bucket and injects them as few-shot examples into the extraction prompt, so the model learns from real user corrections.

---

## 2. Accuracy: Recommended Improvements (Priority Order)

### Tier 1 – High impact, already or easy to add

| Action | Why it helps |
|--------|----------------|
| **Few-shot from user corrections** | Uses real (input, correct output) pairs from the same bucket. Implemented in the worker: we query `ai_interactions` for `corrected_by_user = true` for this bucket and add 1–3 examples to the prompt. |
| **Strong ai_description per field** | Reduces wrong-field mapping (e.g. Work Order vs Driver). Use "Generate AI description" with bucket name and refine with examples of correct vs incorrect values. |
| **Larger model for accuracy** | Use a larger Ollama model (e.g. 8B) where latency is acceptable; keep 1B for speed. Configure per bucket or globally via `OLLAMA_MODEL`. |

### Tier 2 – Medium effort

| Action | Why it helps |
|--------|----------------|
| **JSON Schema in prompt** | Add an explicit “Output must be JSON with exactly these keys: …” and optionally validate the parsed result; retry once if invalid. |
| **Retry on low confidence** | If the first response has many "Not found" or is suspiciously short, retry with a prompt like “Re-read the text and fill every field that has clear evidence.” |
| **Two-stage extraction** | Stage 1: “List entities: people, dates, locations, items.” Stage 2: “Map these entities to bucket fields.” Reduces wrong-field mapping at the cost of two model calls. |

### Tier 3 – Longer term

| Action | Why it helps |
|--------|----------------|
| **Fine-tuning** | Periodically fine-tune (e.g. LoRA) on `(input_text, corrected_output)` per bucket or per tenant. Deploy as a dedicated model or adapter for that bucket. |
| **Confidence / logprobs** | If the inference API exposes logprobs or scores, set low-confidence fields to "Not found" or trigger retry/larger model. |
| **Human-in-the-loop** | Flag extractions with many "Not found" or validation failures for review; use confirmed results as future few-shot or training data. |

---

## 3. Scale: Serving Many Users Globally

### Architecture principles

- **Stateless API**: Backend and workers stay stateless; all state in DB and Redis. Scale by adding more replicas.
- **Queue-based workers**: Jobs in Redis (or a dedicated queue). Scale workers horizontally; same queue, many consumers.
- **Regional deployment**: Run API + workers + Ollama (or another inference backend) per region. Route users to the nearest region to reduce latency.
- **Caching**: Cache extraction result for identical or near-identical text (e.g. hash of normalized text) to avoid duplicate model calls.
- **Rate limiting**: Per-user or per-tenant limits to protect inference and control cost.

### Components

| Component | Role | Scale approach |
|-----------|------|----------------|
| **API (Fastify)** | Auth, CRUD, enqueue jobs | Horizontal replicas behind a load balancer. |
| **Worker** | Consume queue, call Ollama, write DB | Multiple worker replicas; same Redis queue. |
| **Redis** | Job queue + optional cache | Single instance or Redis Cluster for high throughput. |
| **PostgreSQL** | Users, buckets, notes, ai_interactions | Primary + read replicas; connection pooling (e.g. PgBouncer). |
| **Ollama / inference** | Run LLM for extraction | Single node per region or replace with vLLM/TGI for batching and higher throughput. |

### For “millions” of users

- **Inference**: Ollama is single-node. For very high QPS, use a dedicated inference server (e.g. vLLM, Text Generation Inference) with batching and multiple GPUs, or multiple Ollama replicas behind a small router.
- **Queue**: Redis is enough for moderate scale; for very high throughput use a dedicated queue (e.g. RabbitMQ, SQS) and scale workers.
- **DB**: Indexes on `(user_id, bucket_id, created_at)` and on `ai_interactions (bucket_id, corrected_by_user)` for few-shot lookups; tune connection pool and add read replicas as needed.
- **Observability**: Logs, metrics (latency, queue depth, error rate), and alerts so you can fix accuracy and performance issues quickly.

---

## 4. Performance (NFRs)

| Requirement | Status |
|-------------|--------|
| **Streaming / Range** | **In place.** The Fastify backend serves audio at `GET /notes/audio/file/:name` with `Accept-Ranges: bytes`. When the client sends a `Range` header (e.g. for seeking), the server returns `206 Partial Content` and streams only the requested byte range from MinIO, so users can seek without downloading the full file. |
| **Concurrency** | **In place.** **BullMQ** is used for the job queue: the API enqueues jobs (with retries and exponential backoff), and a BullMQ worker processes them. The API uploads raw audio to MinIO and returns immediately; creating the note enqueues a job with `rawKey`. The worker downloads the raw file, runs FFmpeg, uploads proxy + archive to MinIO, updates the note, then runs Whisper and the mapping pipeline. The UI does not hang on upload or long transcriptions. Failed jobs are retried (3 attempts, exponential backoff). |

---

## 5. Summary

- **Accuracy**: Few-shot from user corrections is implemented and gives the biggest gain for the effort. Combine with strong ai_descriptions, optional larger model, then add retries, two-stage extraction, and later fine-tuning as needed.
- **Scale**: Keep API and workers stateless and horizontally scalable; use a queue and regional deployment; add caching and rate limits; upgrade inference and DB as traffic grows.
- **Performance**: Audio supports Range requests for seeking; Whisper/mapping run via a Redis queue so the UI doesn’t hang; FFmpeg runs in the upload request (consider moving to worker for very long files).
