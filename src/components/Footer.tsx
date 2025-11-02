export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30 py-4 px-6 text-center text-sm text-muted-foreground">
      <p>© {currentYear} jjshone. All rights reserved.</p>
    </footer>
  );
}
