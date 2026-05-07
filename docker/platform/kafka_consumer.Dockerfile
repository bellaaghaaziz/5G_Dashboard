FROM python:3.11-slim

WORKDIR /app
COPY requirements_mlops.txt .

RUN pip install --no-cache-dir -r requirements_mlops.txt
RUN pip install --no-cache-dir kafka-python==2.0.2 pandas

COPY mlops/kafka_consumer.py ./consumer.py
RUN mkdir -p DATASET/

CMD ["python", "consumer.py"]