export async function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="#1d4ed8"/>
    <path d="M9 8h10l4 4v12H9z" fill="#fff"/>
    <path d="M19 8v5h5" fill="#bfdbfe"/>
    <path d="M12 17h8M12 21h6" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
