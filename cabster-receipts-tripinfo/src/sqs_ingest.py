import logging
import connect
import os

import boto3

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


def ensure_envvars():
    """Ensure that these environment variables are provided at runtime"""
    required_envvars = [
        "AWS_REGION",
        "INGEST_QUEUE",
        "POSTGRES_HOST",
        "OUT_QUEUE",
        "DATABASE_SECRET",
    ]

    missing_envvars = []
    for required_envvar in required_envvars:
        if not os.environ.get(required_envvar, ''):
            missing_envvars.append(required_envvar)

    if missing_envvars:
        message = "Required environment variables are missing: " + \
            repr(missing_envvars)
        raise AssertionError(message)


def check_plausibility(trip_id, trip_end_data):
    # check plausibility of trip here and return flag if not plausible, as well as raise alarm
    return "OK"

def process_message(message_body):
    logger.info(f"Processing message: {message_body}")
    conn = connect()
    if conn is None:
        raise ReferenceError("DB connection not found")
    if message_body.get("status") == "start":
        data = {
            "id": message_body.get("trip_id"), 
            "start_coords": message_body.get("start_coords"),
            "planned_end_coords": message_body.get("planned_end_coords"),
            "customer_id": message_body.get("customer_id"),
            "rate": message_body.get("rate"),
            "status": message_body.get("status"),
            "projected_price": message_body.get("projected_price")
        }
        cur = conn.cursor()
        cur.execute("INSERT INTO trips (id, start_coords, planned_end_coords, customer_id, rate, status, projected_price) VALUES (%s, %s, %s, %s, %s, %s, %s)", (data["id"], data["start_coords"]))
        conn.commit()
    elif message_body.get("status") == "stop":
        flag = check_plausibility(message_body.get("trip_id"), message_body)
        data = {
            "id": message_body.get("trip_id"), 
            "actual_end_coords": message_body.get("actual_end_coords"),
            "final_price": message_body.get("final_price"),
            "distance_travelled": message_body.get("distance_travelled")
        }
        cur = conn.cursor()
        cur.execute("UPDATE trips SET actual_end_coords = %s,  final_price = %s, distance_travelled = %s, flag = %s WHERE id = %s", (data["actual_end_coords"],data["final_price"], data["distance_travelled"], flag, data["id"]))
        conn.commit()
    cur.close()
    conn.close()

def main():
    logger.info("SQS Consumer starting ...")
    try:
        ensure_envvars()
    except AssertionError as e:
        logger.error(str(e))
        raise

    queue_name = os.environ["INGEST_QUEUE"]
    logger.info(f"Subscribing to queue {queue_name}")
    sqs = boto3.resource("sqs")
    queue = sqs.get_queue_by_name(QueueName=queue_name)

    while True:
        messages = queue.receive_messages(
            MaxNumberOfMessages=1,
            WaitTimeSeconds=1
        )
        for message in messages:
            try:
                process_message(message.body)
            except Exception as e:
                print(f"Exception while processing message: {repr(e)}")
                continue

            message.delete()


if __name__ == "__main__":
    main()