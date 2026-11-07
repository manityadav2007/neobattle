export default function RootLoading() {
  return (
    <div
      className="min-h-screen w-full bg-black text-white"
      style={{ background: '#000', colorScheme: 'dark' }}
    >
      <div className="max-w-lg mx-auto p-4 pt-20 space-y-4 animate-pulse">
        <div className="h-14 rounded-2xl bg-white/5 border border-white/10" />
        <div className="h-44 rounded-3xl bg-white/5 border border-white/10" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl bg-white/5 border border-white/10" />
          <div className="h-20 rounded-2xl bg-white/5 border border-white/10" />
        </div>
      </div>
    </div>
  );
}
