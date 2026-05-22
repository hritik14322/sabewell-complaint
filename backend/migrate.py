import asyncio
import os
import uuid
from dotenv import load_dotenv
from pymongo import MongoClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

# Import models from the new Postgres server
from server import (
    Base, ComplaintTable, CustomerTable, AdminTable, 
    StatusHistoryTable, PhotoTable, CounterTable
)

async def migrate():
    # 1. Connect to MongoDB
    # Since we are running in backend folder, .env is loaded
    load_dotenv('.env')
    
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    
    print(f"Connecting to MongoDB at {mongo_url}, DB: {db_name}")
    try:
        mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
        mongo_client.server_info() # force connection check
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        return
        
    mongo_db = mongo_client[db_name]
    
    # 2. Connect to Postgres
    pg_url = os.environ.get('SUPABASE_DB_URL')
    if not pg_url:
        print("SUPABASE_DB_URL is not set in .env")
        return
        
    print(f"Connecting to Postgres at {pg_url}")
    engine = create_async_engine(pg_url, echo=False)
    
    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        # Migrate Admins
        print("Migrating admins...")
        admins = list(mongo_db.admins.find())
        for a in admins:
            exists = await session.execute(select(AdminTable).filter_by(email=a['email']))
            if not exists.scalar_one_or_none():
                new_admin = AdminTable(
                    email=a['email'],
                    password_hash=a['password_hash'],
                    created_at=a.get('created_at', '2026-05-17T00:00:00')
                )
                session.add(new_admin)
                
        # Migrate Customers
        print("Migrating customers...")
        customers = list(mongo_db.customers.find())
        for c in customers:
            exists = await session.execute(select(CustomerTable).filter_by(phone=c['phone']))
            if not exists.scalar_one_or_none():
                new_cust = CustomerTable(
                    phone=c['phone'],
                    name=c['name'],
                    address=c.get('address', ''),
                    village=c.get('village', ''),
                    city=c.get('city', ''),
                    district=c.get('district', ''),
                    state=c.get('state', ''),
                    pincode=c.get('pincode', ''),
                    created_at=c.get('created_at', '2026-05-17T00:00:00'),
                    updated_at=c.get('updated_at', '2026-05-17T00:00:00')
                )
                session.add(new_cust)
        
        # Migrate Complaints
        print("Migrating complaints...")
        complaints = list(mongo_db.complaints.find())
        for c in complaints:
            exists = await session.execute(select(ComplaintTable).filter_by(complaint_id=c['complaint_id']))
            if not exists.scalar_one_or_none():
                new_comp = ComplaintTable(
                    id=c.get('id', str(uuid.uuid4())),
                    complaint_id=c['complaint_id'],
                    phone=c['phone'],
                    name=c['name'],
                    address=c['address'],
                    village=c.get('village', ''),
                    city=c.get('city', ''),
                    district=c.get('district', ''),
                    state=c.get('state', ''),
                    pincode=c.get('pincode', ''),
                    invoice_number=c.get('invoice_number', ''),
                    product_details=c.get('product_details', ''),
                    product_serial=c.get('product_serial', ''),
                    issue_description=c.get('issue_description', ''),
                    date=c.get('date', ''),
                    status=c.get('status', 'Pending'),
                    warranty=c.get('warranty', 'Warranted'),
                    created_at=c.get('created_at', '2026-05-17T00:00:00'),
                    updated_at=c.get('updated_at', '2026-05-17T00:00:00')
                )
                session.add(new_comp)
                
                # Migrate Status History
                history = c.get('status_history', [])
                for h in history:
                    new_hist = StatusHistoryTable(
                        complaint_id=c['complaint_id'],
                        status=h['status'],
                        note=h.get('note', ''),
                        at=h.get('at', '2026-05-17T00:00:00')
                    )
                    session.add(new_hist)
                    
                # Migrate Photos
                photos = c.get('photos', [])
                for p in photos:
                    new_photo = PhotoTable(
                        id=p['id'],
                        complaint_id=c['complaint_id'],
                        storage_path=p['storage_path'],
                        original_filename=p['original_filename'],
                        content_type=p['content_type'],
                        size=p['size'],
                        uploaded_at=p.get('uploaded_at', '2026-05-17T00:00:00')
                    )
                    session.add(new_photo)

        # Migrate Counters
        print("Migrating counters...")
        counters = list(mongo_db.counters.find())
        for c in counters:
            cid = c['_id']
            exists = await session.execute(select(CounterTable).filter_by(id=cid))
            if not exists.scalar_one_or_none():
                new_count = CounterTable(
                    id=cid,
                    seq=c['seq']
                )
                session.add(new_count)
                
        await session.commit()
        print("Migration completed successfully!")
        
        # Verify
        c_count = await session.execute(select(ComplaintTable))
        print(f"Total complaints in Postgres: {len(c_count.scalars().all())}")

if __name__ == "__main__":
    asyncio.run(migrate())
