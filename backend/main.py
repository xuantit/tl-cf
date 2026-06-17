from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import domains, dns, cache, rules, templates, auth, monitoring, cf, accounts, jobs
from app.core.config import settings

app = FastAPI(
    title="Cloudflare Automation Tool",
    description="Tool to automate Cloudflare: domains, DNS, cache, rules",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
def global_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(domains.router, prefix="/api/domains", tags=["domains"])
app.include_router(dns.router, prefix="/api/dns", tags=["dns"])
app.include_router(cache.router, prefix="/api/cache", tags=["cache"])
app.include_router(rules.router, prefix="/api/rules", tags=["rules"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(cf.router, prefix="/api/cf", tags=["cf"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])


@app.get("/")
def root():
    return {"message": "Cloudflare Automation Tool API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}

