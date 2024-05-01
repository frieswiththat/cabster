import json
import os

import psycopg2


def connect():
    db_secret = json.decoder(os.environ["DATABASE_SECRET"])

    host = os.environ["POSTGRES_HOST"]

    pg_connection_dict = {
      'dbname': db_secret.dbname,
      'user': db_secret.username,
      'password': db_secret.password,
      'port': db_secret.port,
      'host': host
    }
    
    """ Connect to the PostgreSQL database server """
    try:
        # connecting to the PostgreSQL server
        with psycopg2.connect(**pg_connection_dict) as conn:
            print('Connected to the PostgreSQL server.')
            return conn
    except psycopg2.Error as e:
        print("Error connecting to PostgreSQL database:", e)


if __name__ == '__main__':
    connect()