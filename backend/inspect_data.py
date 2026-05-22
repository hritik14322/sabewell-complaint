import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from server import Base, ComplaintTable, CustomerTable

async def inspect_db(db_url, name):
    print(f"\n=================== INSPECTING {name} ===================")
    print(f"URL: {db_url}")
    try:
        engine = create_async_engine(db_url, echo=False)
        AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with AsyncSessionLocal() as session:
            cust_res = await session.execute(select(CustomerTable))
            customers = cust_res.scalars().all()
            print(f"--- CUSTOMERS ({len(customers)}) ---")
            for c in customers:
                print(f"Phone: {c.phone} | Name: {c.name} | Address: {c.address}")

            comp_res = await session.execute(select(ComplaintTable))
            complaints = comp_res.scalars().all()
            print(f"--- COMPLAINTS ({len(complaints)}) ---")
            for c in complaints:
                print(f"ID: {c.id} | ComplaintID: {c.complaint_id} | Phone: {c.phone} | Name: {c.name} | Status: {c.status}")
        await engine.dispose()
    except Exception as e:
        print(f"Error inspecting {name}: {e}")

async def main():
    load_dotenv()
    pg_url = os.environ.get("SUPABASE_DB_URL")
    sqlite_url = "sqlite+aiosqlite:///dev_database.db"
    
    if pg_url:
        await inspect_db(pg_url, "Supabase (Postgres)")
    await inspect_db(sqlite_url, "Local SQLite")

if __name__ == "__main__":
    asyncio.run(main())
