import asyncio
import json
import logging
import random
import uuid
from datetime import datetime
from typing import List, Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.sdk.seven_ma_sdk import SevenPaceAsyncClient, APIError
from app.background import ReservationTask, task_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TASKS_FILE = "periodic_tasks.json"

class PeriodicTaskManager:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.tasks: List[Dict[str, Any]] = []
        self._load_tasks_from_file()

    def _load_tasks_from_file(self):
        try:
            with open(TASKS_FILE, "r") as f:
                self.tasks = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            self.tasks = []

    def _save_tasks_to_file(self):
        with open(TASKS_FILE, "w") as f:
            json.dump(self.tasks, f, indent=4)

    async def _execute_task(self, task_config: Dict[str, Any]):
        logger.info(f"Executing periodic task: {task_config.get('name', task_config['id'])}")
        client = SevenPaceAsyncClient()
        status = "Failed: Unknown error"
        try:
            client.set_token(task_config["token"])
            user_info = await client.get_user_info()
            user_id = str(user_info.id)

            # 1. 查找附近车辆
            surrounding_cars = await client.get_surrounding_cars(
                longitude=task_config["longitude"],
                latitude=task_config["latitude"]
            )

            # 2. 筛选符合车辆类型并随机化列表
            target_car_model_id = task_config.get("carmodel_id")
            
            eligible_cars = [
                car for car in surrounding_cars 
                if target_car_model_id is None or car.carmodel_id.value == target_car_model_id
            ]
            random.shuffle(eligible_cars)

            # 3. 逐一检查电量，找到第一个符合条件的车辆
            found_car = None
            for car_summary in eligible_cars:
                # 避免为已在处理的车辆创建新任务
                if user_id in task_manager and any(t.car_number == car_summary.number and t.status in ["pending", "running"] for t in task_manager[user_id]):
                    continue
                
                try:
                    car_details = await client.get_car_info(car_summary.number)
                    if car_details.electricity:
                        electricity = int(car_details.electricity.replace('%', ''))
                        if electricity >= task_config["min_electricity"]:
                            found_car = car_details
                            logger.info(f"Found suitable car {found_car.number} with {electricity}% electricity.")
                            break # 找到后立即停止搜索
                except (APIError, ValueError, AttributeError) as e:
                    logger.warning(f"Could not process car {car_summary.number}: {e}")
            
            # 4. 如果找到合适的车辆，创建后台预约任务
            if found_car:
                new_task = ReservationTask(
                    token=task_config["token"],
                    user_id=user_id,
                    car_number=found_car.number,
                    max_loops=task_config.get("max_loops", 10)
                )
                if user_id not in task_manager:
                    task_manager[user_id] = []
                task_manager[user_id].append(new_task)
                asyncio.create_task(new_task.run())
                status = f"Success: Created task for car {found_car.number}"
            else:
                logger.info("No suitable car found for periodic task.")
                status = "Failed: No suitable car found"

        except Exception as e:
            logger.error(f"Error executing periodic task {task_config.get('id')}: {e}")
            status = f"Failed: {e}"
        finally:
            await client.close()
            # Update and save the task status
            for task in self.tasks:
                if task["id"] == task_config["id"]:
                    task["last_run_time"] = datetime.now().isoformat()
                    task["last_run_status"] = status
                    break
            self._save_tasks_to_file()

    def start(self):
        for task_config in self.tasks:
            self.scheduler.add_job(
                self._execute_task,
                CronTrigger.from_crontab(task_config["cron"]),
                args=[task_config],
                id=task_config["id"],
                name=task_config.get("name")
            )
        self.scheduler.start()
        logger.info("Scheduler started with all periodic tasks.")

    def shutdown(self):
        self.scheduler.shutdown()
        logger.info("Scheduler shut down.")

    def add_task(self, task_config: Dict[str, Any]) -> Dict[str, Any]:
        task_id = str(uuid.uuid4())
        task_config["id"] = task_id
        self.tasks.append(task_config)
        self._save_tasks_to_file()
        self.scheduler.add_job(
            self._execute_task,
            CronTrigger.from_crontab(task_config["cron"]),
            args=[task_config],
            id=task_config["id"],
            name=task_config.get("name")
        )
        logger.info(f"Added new periodic task: {task_config.get('name', task_id)}")
        return task_config

    def update_task(self, task_id: str, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        task_to_update = next((task for task in self.tasks if task["id"] == task_id and task["user_id"] == user_id), None)
        if not task_to_update:
            raise ValueError("Task not found or permission denied")

        task_to_update.update(updates)
        self._save_tasks_to_file()

        self.scheduler.reschedule_job(
            task_id,
            trigger=CronTrigger.from_crontab(task_to_update["cron"]),
            args=[task_to_update]
        )
        logger.info(f"Updated periodic task: {task_id}")
        return task_to_update

    def remove_task(self, task_id: str, user_id: str):
        task_to_remove = next((task for task in self.tasks if task["id"] == task_id and task["user_id"] == user_id), None)
        if not task_to_remove:
            raise ValueError("Task not found or permission denied")
        
        self.tasks.remove(task_to_remove)
        self._save_tasks_to_file()
        try:
            self.scheduler.remove_job(task_id)
            logger.info(f"Removed periodic task: {task_id}")
        except Exception as e:
            logger.error(f"Error removing job {task_id} from scheduler: {e}")

    def get_tasks_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        return [task for task in self.tasks if task.get("user_id") == user_id]

# 全局调度器实例
scheduler_manager = PeriodicTaskManager()
