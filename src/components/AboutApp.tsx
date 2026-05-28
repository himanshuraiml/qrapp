import Link from 'next/link'

export default function AboutApp() {
  return (
    <div className="card relative overflow-hidden bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-white/60 p-6 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-md transition-all duration-300">
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl pointer-events-none"></div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        <div className="space-y-2 text-center sm:text-left max-w-2xl">
          <h3 className="text-sm font-extrabold text-slate-800 tracking-wider uppercase flex items-center justify-center sm:justify-start gap-2">
            <span>✨</span> About QR Attendance
          </h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            An elegant, high-speed QR-based attendance tracking platform designed for SRMIST Trichy. It facilitates real-time scan verification, dynamic secure QR generation, and automated classroom logs with robust analytics for students, faculty, and administrators alike.
          </p>
        </div>
        <a
          href="https://www.linkedin.com/in/himanshurai14/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0077b5] hover:bg-[#006297] text-white text-xs font-bold transition-all duration-300 transform active:scale-95 shadow-md shadow-blue-500/10 hover:shadow-lg whitespace-nowrap"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.8v8.37h2.8v-4.87c0-.26.05-.52.13-.7a.9.9 0 0 1 .82-.6c.45 0 .78.34.78.93v5.24zM6.5 8.37a1.37 1.37 0 1 0 0-2.75 1.37 1.37 0 0 0 0 2.75M8 18.5V10.13H5V18.5z"/>
          </svg>
          Connect on LinkedIn
        </a>
      </div>
    </div>
  )
}
