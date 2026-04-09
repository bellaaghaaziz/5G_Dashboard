FROM python:3.10-slim
WORKDIR /app
COPY app.py /app/
COPY *.pkl /app/
RUN pip install --no-cache-dir streamlit pandas numpy scikit-learn xgboost joblib
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]