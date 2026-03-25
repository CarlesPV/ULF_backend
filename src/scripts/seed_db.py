import json
import os
import firebase_admin
from firebase_admin import credentials, db

DATABASE_URL = os.environ["FIREBASE_DATABASE_URL"]
FIREBASE_SERVICE_ACCOUNT = os.environ["FIREBASE_SERVICE_ACCOUNT"]
CENTERS_PATH = "src/data/centers.json"

service_account_info = json.loads(FIREBASE_SERVICE_ACCOUNT)
cred = credentials.Certificate(service_account_info)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})

with open(CENTERS_PATH, "r", encoding="utf-8") as f:
    centers = json.load(f)

ref = db.reference("/centers")

for center in centers:
    center_ref = ref.child(center["id"])
    if center_ref.get() is None:
        center_ref.set(center)
        print(f"[INSERT] {center['id']}")
    else:
        center_ref.update(center)
        print(f"[UPDATE] {center['id']}")