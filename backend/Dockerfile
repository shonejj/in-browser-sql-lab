FROM python:3.12-slim

WORKDIR /app

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application code
COPY main.py .
COPY workflows.py .
COPY worker.py .

EXPOSE 9876

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9876"]
