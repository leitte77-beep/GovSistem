export async function getSecretaria() {
  try {
    const res = await fetch("/api/govouve/public/secretaria");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getTiposManifestacao() {
  try {
    const res = await fetch("/api/govouve/public/ouvidoria/tipos");
    if (!res.ok) return [];
    const data = await res.json();
    return data.tipos || [];
  } catch {
    return [];
  }
}

export async function getCartaServicos() {
  try {
    const res = await fetch("/api/govouve/public/carta-servicos");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
