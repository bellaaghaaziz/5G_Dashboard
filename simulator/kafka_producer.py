import time
import json
import random
from kafka import KafkaProducer
import pandas as pd
import datetime

# Kafka Configuration
KAFKA_BROKER = 'localhost:9092'
TOPIC_NAME = '5g-telemetry'

def generate_telemetry():
    """Simulates real-time 5G network telemetry from a moving UE."""
    hour = datetime.datetime.utcnow().hour
    load = 1 if (17 <= hour <= 20) else 0  # Peak hours simulation
    
    return {
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "rsrp": round(random.uniform(-110, -60), 2),
        "rsrq": round(random.uniform(-20, -5), 2),
        "sinr": round(random.uniform(-10, 25), 2),
        "cqi": random.randint(1, 15),
        "tx_power": random.randint(0, 23),
        "ta": random.randint(0, 60),
        "velocity": round(random.uniform(0, 30), 2),
        "best_neighbor_rsrp": round(random.uniform(-110, -60), 2),
        "cell_hist_datarate_mean": round(random.uniform(5, 100), 2),
        "cell_load_drop_flag": load,
        "is_ho": random.choices([0, 1], weights=[0.95, 0.05])[0] 
    }

if __name__ == '__main__':
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BROKER,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    print(f"📡 Started Kafka Telemetry Generator on {KAFKA_BROKER} | Topic: {TOPIC_NAME}")
    
    try:
        while True:
            payload = generate_telemetry()
            producer.send(TOPIC_NAME, payload)
            producer.flush()
            print(f"Produced: {payload}")
            time.sleep(1) # Send 1 record per second
    except KeyboardInterrupt:
        print("Stopped Producer.")
        producer.close()