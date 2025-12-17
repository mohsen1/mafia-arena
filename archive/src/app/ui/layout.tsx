export default function UI({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="w-full">{children}</div>
    </div>
  );
}
