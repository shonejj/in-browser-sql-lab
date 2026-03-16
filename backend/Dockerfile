FROM python:3.12-slim

WORKDIR /app

# Copy and install requirements
# Note: DuckDB 1.x ships with pre-compiled wheels, no build tools needed
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

EXPOSE 9876

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9876"]
