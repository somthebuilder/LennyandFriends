'use client'

export default function CampfireLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background smoke/glow elements */}
      <ellipse
        cx="30"
        cy="60"
        rx="25"
        ry="20"
        fill="#a5d8ff"
        opacity="0.3"
        stroke="#93c5fd"
        strokeWidth="1"
      />
      <ellipse
        cx="70"
        cy="55"
        rx="20"
        ry="18"
        fill="#a5d8ff"
        opacity="0.3"
        stroke="#93c5fd"
        strokeWidth="1"
      />
      <circle
        cx="85"
        cy="25"
        r="8"
        fill="#a5d8ff"
        opacity="0.3"
        stroke="#93c5fd"
        strokeWidth="1"
      />
      <circle
        cx="15"
        cy="85"
        r="5"
        fill="#a5d8ff"
        opacity="0.3"
        stroke="#93c5fd"
        strokeWidth="1"
      />
      
      {/* Logs */}
      <rect
        x="35"
        y="70"
        width="30"
        height="8"
        rx="2"
        fill="#8b6f47"
        stroke="#6b5638"
        strokeWidth="2"
      />
      <rect
        x="40"
        y="75"
        width="20"
        height="8"
        rx="2"
        fill="#8b6f47"
        stroke="#6b5638"
        strokeWidth="2"
      />
      
      {/* Flames */}
      <path
        d="M 45 70 Q 40 50, 45 40 Q 50 35, 55 40 Q 60 50, 55 70 Z"
        fill="#f97316"
        stroke="#c2410c"
        strokeWidth="2"
      />
      <path
        d="M 50 70 Q 48 55, 50 45 Q 52 40, 54 45 Q 56 55, 54 70 Z"
        fill="#fbbf24"
        stroke="#f97316"
        strokeWidth="1.5"
      />
      <path
        d="M 48 70 Q 46 60, 48 50 Q 50 48, 52 50 Q 54 60, 52 70 Z"
        fill="#fef3c7"
        stroke="#fbbf24"
        strokeWidth="1"
      />
      
      {/* Additional flame details */}
      <path
        d="M 42 70 Q 38 55, 42 42 Q 46 38, 50 42"
        fill="#fb923c"
        stroke="#f97316"
        strokeWidth="1.5"
        opacity="0.8"
      />
      <path
        d="M 58 70 Q 62 55, 58 42 Q 54 38, 50 42"
        fill="#fb923c"
        stroke="#f97316"
        strokeWidth="1.5"
        opacity="0.8"
      />
    </svg>
  )
}

