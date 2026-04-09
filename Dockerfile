# 1. Use the official Python image
FROM python:3.10-slim

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy your app and AI models into the container
COPY app.py /app/
COPY *.pkl /app/

# 4. Install the required Python libraries
RUN pip install --no-cache-dir streamlit pandas numpy scikit-learn xgboost joblib

# 5. Expose the port Streamlit uses
EXPOSE 8501

# 6. Command to run the dashboard when the container starts
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]