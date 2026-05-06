FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir pandas pyarrow
COPY mlops/dataset_replayer.py .
CMD ["python", "dataset_replayer.py"]
