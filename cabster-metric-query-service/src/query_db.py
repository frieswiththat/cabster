import connect
from fastapi import FastAPI, HTTPException
import psycopg2

app = FastAPI()

# TODO 1: Add connection pooling
# TODO 2: Don't just proxy queries with the admin user. Recipe for disaster.
@app.post("/query/")
async def execute_query(query: str):
    conn = connect()
    if conn is None:
        raise HTTPException(status_code=500, detail="Internal Server Error")

    try:
        cur = conn.cursor()
        cur.execute(query)

        results = cur.fetchall()
        cur.close()
        conn.close()

        return {"data": results}

    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)