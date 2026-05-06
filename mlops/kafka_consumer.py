import os
import json
import pandas as pd
from kafka import KafkaConsumer
from datetime import datetime

# Kafka setup
KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
TOPIC = os.getenv("KAFKA_TOPIC", "5g-telemetry")
DATA_PATH = os.getenv("DATA_PATH", "DATASET/raw/live_data.csv")

BATCH_SIZE = 1000

if __name__ == '__main__':
    # Initialize Kafka Consumer
    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        auto_offset_reset='latest',
        enable_auto_commit=True,
        group_id='mlops-group',
        value_deserializer=lambda x: json.loads(x.decode('utf-8'))
    )

    print(f"👂 Listening to Kafka on {KAFKA_BROKER} | Topic: {TOPIC}")
    print(f"💾 Will write to: {DATA_PATH} in batches of {BATCH_SIZE}")

    buffer = []
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    
    try:
        if not os.path.exists(DATA_PATH):
            pd.DataFrame(columns=[
                "timestamp", "rsrp", "rsrq", "sinr", "cqi", "tx_power", 
                "ta", "velocity", "best_neighbor_rsrp", "cell_hist_datarate_mean", 
                "cell_load_drop_flag", "is_ho"
            ]).to_csv(DATA_PATH, index=False)
            print(f"Created new file: {DATA_PATH}")

        # Streaming loop
        for message in consumer:
            telemetry = message.value
            buffer.append(telemetry)
            print(f"Received msg (Buffer:{len(buffer)}/{BATCH_SIZE})")

            # When batch size is hit, append to the raw dataset and trigger pipeline retraining
            if len(buffer) >= BATCH_SIZE:
                print(f"📦 Threshold reached. Appending {BATCH_SIZE} rows to {DATA_PATH}")
                df = pd.DataFrame(buffer)
                df.to_csv(DATA_PATH, mode='a', header=False, index=False)
                buffer = [] # Reset buffer
                print(f"✅ Data written. Ready for DVC Pull in Airflow Pipeline!")

    except KeyboardInterrupt:
        print("Consumer Interrupted.")
        consumer.close()