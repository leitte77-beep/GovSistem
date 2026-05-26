import pytest
from app.services.subscription import record_subscription_event


class TestSubscriptionService:

    @pytest.mark.asyncio
    async def test_record_subscription_event(self):
        import uuid
        from datetime import datetime, timezone
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool

        from app.models.base import Base

        engine = create_async_engine(
            "sqlite+aiosqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        TestSession = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with TestSession() as db:
            sub_id = uuid.uuid4()
            org_id = uuid.uuid4()
            await record_subscription_event(
                db=db,
                subscription_id=sub_id,
                organization_id=org_id,
                event_type="status_change",
                new_status="active",
                old_status="pending_payment",
                amount_cents=10000,
                triggered_by="system",
            )
            await db.commit()

            from app.models.subscription_event import SubscriptionEvent
            result = await db.execute(
                __import__("sqlalchemy").select(SubscriptionEvent).where(
                    SubscriptionEvent.subscription_id == sub_id
                )
            )
            events = result.scalars().all()
            assert len(events) == 1
            assert events[0].event_type == "status_change"
            assert events[0].new_status == "active"
            assert events[0].old_status == "pending_payment"
            assert events[0].amount_cents == 10000
