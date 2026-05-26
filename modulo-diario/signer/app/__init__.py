from fastapi import FastAPI

app = FastAPI(title="Signer Service - Modulo Diario", version="1.0.0")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "service": "signer-modulo-diario"}
