import pandas as pd
import random
from datetime import datetime, timedelta

ROWS = 500_000

activities = [
    "Create Order",
    "Goods Issue",
    "Freight Booking",
    "Air Freight",
    "Sea Freight",
    "Road Freight",
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery"
]

suppliers = [f"S{i:03d}" for i in range(1, 51)]

records = []

start = datetime(2025, 1, 1)

for i in range(ROWS):

    if i % 10000 == 0:
        print(f"{i:,} rows generated")

    activity = random.choice(activities)

    r = random.random()

    if r < 0.12:
        violation = "CARBON_VIOLATION"
    elif r < 0.18:
        violation = "PROCESS_VIOLATION"
    elif r < 0.22:
        violation = "DATA_QUALITY_ISSUE"
    else:
        violation = "NONE"

    records.append([
        f"E{i+1:07d}",
        f"O{random.randint(1,75000):06d}",
        random.choice(suppliers),
        activity,
        (start + timedelta(minutes=i)).strftime("%Y-%m-%d %H:%M:%S"),
        round(random.uniform(0.5, 5.0), 2),
        random.choice([150, 250, 300]),
        random.choice(["A", "B", "C", "D", "E"]),
        random.choice(["AIR", "SEA", "ROAD"]),
        violation
    ])

df = pd.DataFrame(records, columns=[
    "event_id",
    "order_id",
    "supplier_id",
    "activity",
    "timestamp",
    "carbon_factor",
    "carbon_budget",
    "supplier_rating",
    "transport_type",
    "violation_type"
])

df.to_csv("events_500k.csv", index=False)

print("DONE")
print("Rows:", len(df))