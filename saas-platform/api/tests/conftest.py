import os

os.environ["SECRET_KEY"] = "test-secret-key-not-for-production-32bytes!"
os.environ["POSTGRES_PASSWORD"] = "test-password"
os.environ["ASAAS_API_KEY"] = "test-asaas-key"
os.environ["ASAAS_WEBHOOK_TOKEN"] = "test-webhook-token"
os.environ["DEBUG"] = "true"
