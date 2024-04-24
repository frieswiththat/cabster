import connect
from fastapi import FastAPI

app = FastAPI()

@app.get('/query') # get method to empty endpoint
def first_response():
    return {"response": "first"}