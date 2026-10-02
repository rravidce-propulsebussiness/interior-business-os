export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl p-4 md:p-6"
    >
      {children}
    </main>
  );
}
