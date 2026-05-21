export function PcoSignInButton({
  children = "Sign in with Planning Center",
  className = "btn btn-primary",
  href = "/auth/sign-in/start",
}: {
  children?: string;
  className?: string;
  href?: string;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
