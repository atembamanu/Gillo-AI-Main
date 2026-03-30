interface AppHeaderProps {
  displayName: string | null | undefined;
  onGoToProfile: () => void;
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className ?? 'h-5 w-5'}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

export function AppHeader({ displayName, onGoToProfile }: AppHeaderProps) {
  const trimmed = displayName?.split(' ').pop()?.trim();
  const showGreeting = Boolean(trimmed);

  return (
    <header className="sticky top-0 z-10 border-b border-brand-dark/10 bg-brand-bg/95 backdrop-blur supports-[backdrop-filter]:bg-brand-bg/80">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4">
        <img
          src="/gillologo.webp"
          alt="Gillo"
          className="h-16 w-auto flex-shrink-0"
        />
        {showGreeting ? (
          <p className="truncate text-sm font-medium text-brand-dark">
            Hi, {trimmed}
          </p>
        ) : (
          <button
            type="button"
            onClick={onGoToProfile}
            className="flex items-center justify-center rounded-full p-2 text-brand-dark/70 transition-colors hover:bg-brand-dark/5 hover:text-brand-primary"
            aria-label="Update profile"
          >
            <ProfileIcon className="h-6 w-6" />
          </button>
        )}
      </div>
    </header>
  );
}
