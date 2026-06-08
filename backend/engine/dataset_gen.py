import pandas as pd
import random
from datetime import datetime, timedelta

NUM_ROWS = 1_000_000

activities = [
    "Create Order",
    "Supplier Selection",
    "Purchase Approval",
    "Production",
    "Quality Check",
    "Freight Booking",
    "Shipment",
    "Customs Clearance",
    "Delivery"
]

supplier_ratings = ["A", "B", "C", "D", "E"]

transport_types = [
    "Air Freight",
    "Sea Freight",
    "Road Freight",
    "None"
]

violation_types = [
    "NONE",
    "Carbon",
    "Process",
    "Data"
]

start_date = datetime(2025, 1, 1)

data = []

for i in range(1, NUM_ROWS + 1):

    event_id = f"E{i:07d}"

    order_num = random.randint(1, 100000)
    order_id = f"O{order_num:05d}"

    supplier_num = random.randint(1, 500)
    supplier_id = f"S{supplier_num:03d}"

    activity = random.choice(activities)

    timestamp = start_date + timedelta(
        days=random.randint(0, 365),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59)
    )

    supplier_rating = random.choice(supplier_ratings)

    if activity in ["Create Order", "Supplier Selection"]:
        transport_type = "None"
    else:
        transport_type = random.choice([
            "Air Freight",
            "Sea Freight",
            "Road Freight"
        ])

    # carbon_budget per order — set so Air Freight traces actually breach it
    carbon_budget = 20

    # carbon_factor reflects transport intensity
    if transport_type == "Air Freight":
        carbon_factor = round(random.uniform(3.5, 5.0), 2)
    elif transport_type == "Road Freight":
        carbon_factor = round(random.uniform(1.0, 2.5), 2)
    elif transport_type == "Sea Freight":
        carbon_factor = round(random.uniform(0.5, 1.5), 2)
    else:
        carbon_factor = round(random.uniform(0.5, 1.2), 2)

    # violation_type must match the actual data:
    # Air Freight with high carbon_factor will sum past budget=20 → Carbon
    violation_probability = random.random()
    if transport_type == "Air Freight" and carbon_factor > 3.0:
        violation_type = "Carbon"
    elif violation_probability < 0.87:
        violation_type = "NONE"
    elif violation_probability < 0.94:
        violation_type = "Process"
    else:
        violation_type = "Data"

    data.append([
        event_id,
        order_id,
        supplier_id,
        activity,
        timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        carbon_factor,
        carbon_budget,
        supplier_rating,
        transport_type,
        violation_type
    ])

    if i % 100000 == 0:
        print(f"{i:,} rows generated...")

df = pd.DataFrame(
    data,
    columns=[
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
    ]
)

output_file = "event_log_1000000.csv"

df.to_csv(output_file, index=False)

print(f"\nDataset saved as {output_file}")
print(f"Total rows: {len(df):,}")