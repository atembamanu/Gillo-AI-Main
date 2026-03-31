import { prisma } from './prisma';

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await prisma.$queryRawUnsafe(text, ...params);
  return Array.isArray(result) ? (result as T[]) : [];
}
