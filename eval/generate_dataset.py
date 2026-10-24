import csv
import random
import hashlib
from pathlib import Path

random.seed(42)

CITIES_DATA = {
    "Bengaluru": {
        "localities": [
            ("Indiranagar", {1: 22000, 2: 40000, 3: 65000}, (3, 6)),
            ("HSR Layout", {1: 18000, 2: 32000, 3: 52000}, (3, 6)),
            ("Koramangala", {1: 22000, 2: 42000, 3: 68000}, (3, 6)),
            ("Whitefield", {1: 16000, 2: 28000, 3: 45000}, (2, 5)),
            ("Bellandur", {1: 18000, 2: 32000, 3: 50000}, (2, 5))
        ]
    },
    "Mumbai": {
        "localities": [
            ("Powai", {1: 34000, 2: 55000, 3: 85000}, (2, 4)),
            ("Andheri West", {1: 32000, 2: 52000, 3: 78000}, (2, 4)),
            ("Bandra West", {1: 45000, 2: 75000, 3: 130000}, (2, 5))
        ]
    },
    "Gurgaon": {
        "localities": [
            ("DLF Phase 2", {1: 24000, 2: 40000, 3: 60000}, (1, 3)),
            ("Cyber City", {1: 25000, 2: 42000, 3: 62000}, (1, 3)),
            ("Sector 56", {1: 16000, 2: 28000, 3: 42000}, (1, 2))
        ]
    },
    "Pune": {
        "localities": [
            ("Hinjawadi", {1: 14000, 2: 23000, 3: 35000}, (1, 3)),
            ("Wakad", {1: 15000, 2: 24000, 3: 36000}, (1, 3))
        ]
    }
}

NORMAL_DESCRIPTIONS = [
    "Spacious flat with abundant natural light and cross ventilation. Semi-furnished with modular kitchen and built-in wardrobes. Dedicated car parking and 24x7 security guard.",
    "Well maintained apartment close to metro station, IT parks, and grocery stores. 100% power backup, club house, gym, and swimming pool access included.",
    "East facing family flat in gated society. Walking distance to reputed international school and hospital. Visits can be scheduled on weekends with prior appointment.",
    "Furnished apartment with air conditioning, geysers, and chimney. Looking for working professionals or small family. Maintenance separate as per society bill.",
    "Newly painted flat on higher floor with scenic balcony view. Standard 11-month agreement with 5% escalation. Physical inspection available daily between 11 AM to 6 PM.",
    "Peaceful residential locality with Cauvery water connection and borewell. Covered two-wheeler and four-wheeler parking available. Possession from beginning of next month.",
    "Cozy flat with modern bathroom fittings, piped gas connection, and private balcony. Keys available with building caretaker for in-person viewing."
]

SCAM_DESCRIPTIONS = [
    "I am an Indian Army defense officer posted to Srinagar on urgent duty transfer. Fully furnished imported luxury interior. Rent is kept low because money is not my motive. Keys are with military camp courier. Before physical viewing, society gate pass entry fee of Rs 2500 must be sent via UPI scanner. Amount is 100% refundable upon gate entry.",
    "Urgent flat rent! Defense personnel transferred on emergency deployment. High demand listing, rent heavily discounted. To schedule viewing slot, send refundable visiting token of Rs 2000 on WhatsApp scanner to generate gate entry slip.",
    "Exclusive luxury penthouse. Owner permanently relocated abroad to London. Keys deposited with international courier delivery service. Courier requires clearance pass of 3000 rupees before delivering keys to gate.",
    "Urgent rent! Leaving country tonight. Nominal rent with zero deposit scheme. Multiple tenants queued. Pay booking token Rs 2500 on PhonePe to reserve viewing. 100% refundable if you do not like flat.",
    "CISF security officer transferred to border station. Looking for decent tenant to maintain flat. Society manager requires visiting card charge and entry pass before entrance gate. WhatsApp immediately for UPI QR code.",
    "Fully furnished 3BHK flat at nominal rent. Transferred defense personnel. Keys dispatched via courier. Entry pass registration fee of Rs 2000 required before physical visit, refundable upon gate arrival.",
    "Military officer transferred out of station on emergency duty posting. Zero brokerage flat. Pay visiting token before viewing to get visitor digital entry pass. Refundable on gate arrival."
]

SHARED_HASHES = [
    "a4c28f1107be924d",
    "f1e2d3c4b5a69788",
    "c8a14e927f05b3d6",
    "3f2a18b9c4d5e607"
]

def generate_dataset(output_path: str):
    records = []
    current_id = 1

    all_localities = []
    for city, cdata in CITIES_DATA.items():
        for loc, medians, dep_range in cdata["localities"]:
            all_localities.append((city, loc, medians, dep_range))

    # 1. Generate 125 Normal Listings
    for i in range(125):
        city, loc, medians, dep_range = random.choice(all_localities)
        bhk = random.choice([1, 2, 3])
        base_rent = medians[bhk]

        # Normal rent: between -20% and +25% of median
        rent_factor = random.uniform(0.80, 1.25)
        rent = int(round((base_rent * rent_factor) / 500.0) * 500)

        # Normal deposit
        dep_months = random.uniform(dep_range[0], dep_range[1])
        deposit = int(round((rent * dep_months) / 1000.0) * 1000)

        title = f"{bhk} BHK Apartment for Rent in {loc}, {city}"
        desc = random.choice(NORMAL_DESCRIPTIONS)

        # 95% unique image hash, 5% shared builder model photo (legitimate broker reuse)
        if random.random() < 0.08:
            img_hash = random.choice(SHARED_HASHES)
            is_dup = True
        else:
            seed_str = f"normal-{current_id}-{rent}-{loc}"
            img_hash = hashlib.md5(seed_str.encode()).hexdigest()[:16]
            is_dup = False

        reason = "Standard market rent and deposit within locality norms. In-person visit without advance fee."

        records.append({
            "id": current_id,
            "city": city,
            "locality": loc,
            "bhk": bhk,
            "rent": rent,
            "deposit": deposit,
            "title": title,
            "description": desc,
            "image_hash": img_hash,
            "is_duplicate_photo": "True" if is_dup else "False",
            "label": "normal",
            "reason": reason
        })
        current_id += 1

    # 2. Generate 125 Suspicious Listings
    for i in range(125):
        city, loc, medians, dep_range = random.choice(all_localities)
        bhk = random.choice([2, 3]) # Scammers usually bait with 2BHK or 3BHK
        base_rent = medians[bhk]

        # Scam pattern type
        scam_type = random.choice(["army_token", "absentee_courier", "zero_deposit_urgency", "bait_price_only"])

        if scam_type == "army_token":
            # Bait low rent (-45% to -70%)
            rent = int(round((base_rent * random.uniform(0.30, 0.55)) / 500.0) * 500)
            deposit = rent * random.choice([1, 2])
            desc = random.choice([d for d in SCAM_DESCRIPTIONS if "Army" in d or "Defense" in d or "Military" in d or "CISF" in d])
            reason = "Claims defense transfer pretext and demands advance gate pass token via UPI before visit."
            img_hash = random.choice(SHARED_HASHES)
            is_dup = True

        elif scam_type == "absentee_courier":
            rent = int(round((base_rent * random.uniform(0.35, 0.60)) / 500.0) * 500)
            deposit = rent * random.choice([1, 2])
            desc = random.choice([d for d in SCAM_DESCRIPTIONS if "abroad" in d or "courier" in d])
            reason = "Claims remote owner with courier key clearance fee demanded before inspection."
            img_hash = random.choice(SHARED_HASHES)
            is_dup = True

        elif scam_type == "zero_deposit_urgency":
            rent = int(round((base_rent * random.uniform(0.40, 0.65)) / 500.0) * 500)
            deposit = 0
            desc = "Urgent rent! Leaving country tonight. Nominal rent with zero deposit scheme. Multiple tenants queued. Pay booking token Rs 2500 on PhonePe to reserve viewing slot. 100% refundable upon arrival."
            reason = "Advertises zero deposit with urgent pressure and refundable booking token demanded via UPI."
            img_hash = random.choice(SHARED_HASHES)
            is_dup = True

        else: # bait_price_only
            rent = int(round((base_rent * random.uniform(0.35, 0.50)) / 500.0) * 500)
            deposit = rent * 2
            desc = "Fully furnished flat at heavily discounted price for quick occupancy. In-person visit on token confirmation."
            reason = f"Rent is >50% below {loc} {bhk}BHK median with token confirmation demanded."
            img_hash = hashlib.md5(f"scam-bait-{current_id}".encode()).hexdigest()[:16]
            is_dup = False

        title = f"Urgent Luxury {bhk} BHK Apartment in {loc}, {city}"

        records.append({
            "id": current_id,
            "city": city,
            "locality": loc,
            "bhk": bhk,
            "rent": rent,
            "deposit": deposit,
            "title": title,
            "description": desc,
            "image_hash": img_hash,
            "is_duplicate_photo": "True" if is_dup else "False",
            "label": "suspicious",
            "reason": reason
        })
        current_id += 1

    # Shuffle with fixed seed and assign 70% train / 30% test split
    random.shuffle(records)
    split_index = int(len(records) * 0.70) # 175 train, 75 test

    for idx, r in enumerate(records):
        r["split"] = "train" if idx < split_index else "test"

    # Write CSV
    fieldnames = [
        "id", "city", "locality", "bhk", "rent", "deposit",
        "title", "description", "image_hash", "is_duplicate_photo",
        "label", "reason", "split"
    ]

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f"Successfully generated {len(records)} labeled records ({split_index} train, {len(records) - split_index} test) into {output_path}")

if __name__ == "__main__":
    generate_dataset("eval/labels.csv")
