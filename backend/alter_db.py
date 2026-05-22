import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    load_dotenv('.env')
    engine = create_async_engine(os.environ['SUPABASE_DB_URL'])
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE customers ADD COLUMN email VARCHAR DEFAULT '';"))
            print('Added email to customers')
        except Exception as e:
            print(f"customers: {e}")
            
        try:
            await conn.execute(text("ALTER TABLE complaints ADD COLUMN email VARCHAR DEFAULT '';"))
            print('Added email to complaints')
        except Exception as e:
            print(f"complaints: {e}")

asyncio.run(main())
