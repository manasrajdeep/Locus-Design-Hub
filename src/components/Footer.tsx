export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center">
        <p className="text-xs tracking-wider text-muted-foreground">
          Website made by{" "}
          <a
            href="https://manasrajdeep.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-amber-brand transition-colors"
          >
            manasrajdeep.in
          </a>
        </p>
      </div>
    </footer>
  );
}
