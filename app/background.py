import asyncio
import logging
from typing import Dict, List
from .sdk.seven_ma_sdk import SevenPaceAsyncClient, APIError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ReservationTask:
    def __init__(self, token: str, user_id: str, car_number: str, max_loops: int = 10):
        self.token = token
        self.user_id = user_id
        self.car_number = car_number
        self.max_loops = max_loops
        self.current_loop = 0
        self.status = "pending"
        self.message = "任务已创建，等待开始"
        self._stop_event = asyncio.Event()

    async def run(self):
        self.status = "running"
        self.message = "任务正在运行"
        logger.info(f"Task for user {self.user_id} on car {self.car_number} started.")

        client = SevenPaceAsyncClient()
        client.set_token(self.token)

        try:
            while self.current_loop < self.max_loops and not self._stop_event.is_set():
                self.current_loop += 1
                self.message = f"第 {self.current_loop}/{self.max_loops} 轮预约开始"
                logger.info(f"User {self.user_id}, Car {self.car_number}: Loop {self.current_loop}/{self.max_loops}")

                try:
                    # 1. 预约车辆
                    order_message = await client.order_car(self.car_number)
                    self.message = f"第 {self.current_loop} 轮: 预约成功 - {order_message}"
                    logger.info(f"User {self.user_id}, Car {self.car_number}: Ordered successfully.")

                    # 2. 等待24分钟 (1440秒)，然后主动还车以避免收费
                    wait_seconds = 24 * 60
                    for i in range(wait_seconds, 0, -1):
                        if self._stop_event.is_set():
                            break
                        
                        # 每分钟更新一次消息
                        if i % 60 == 0 or i == wait_seconds:
                            remaining_minutes = (i + 59) // 60 # 向上取整
                            self.message = f"第 {self.current_loop} 轮: 等待 {remaining_minutes} 分钟后主动还车..."
                        
                        await asyncio.sleep(1)

                    if self._stop_event.is_set():
                        break

                    # 3. 主动还车，并加入重试机制以确保成功
                    return_successful = False
                    max_retries = 12 # 重试12次，大约3分钟
                    for i in range(max_retries):
                        if self._stop_event.is_set():
                            break
                        try:
                            self.message = f"第 {self.current_loop} 轮: 正在主动还车 (尝试 {i + 1}/{max_retries})..."
                            await client.back_car()
                            return_successful = True
                            self.message = f"第 {self.current_loop} 轮: 已主动还车，准备下一轮。"
                            logger.info(f"User {self.user_id}, Car {self.car_number}: Manually returned car successfully.")
                            await asyncio.sleep(5) # 等待操作生效
                            break # 还车成功，跳出重试循环
                        except APIError as e:
                            self.message = f"第 {self.current_loop} 轮: 还车失败({e})。15秒后重试..."
                            logger.error(f"User {self.user_id}, Car {self.car_number}: Failed to return car (attempt {i + 1}): {e}")
                            await asyncio.sleep(15)
                    
                    if not return_successful:
                        self.message = "多次还车失败，任务已终止以避免风险。"
                        logger.critical(f"User {self.user_id}, Car {self.car_number}: Failed to return car after {max_retries} retries. Task is stopping.")
                        break # 关键：如果多次还车失败，必须终止整个任务

                except APIError as e:
                    self.message = f"第 {self.current_loop} 轮预约出错: {e}"
                    logger.error(f"User {self.user_id}, Car {self.car_number}: APIError in loop {self.current_loop}: {e}")
                    # 如果是预约失败（例如车辆被占用），则等待一段时间再试
                    await asyncio.sleep(60)
                    continue # 继续下一次循环尝试
                except Exception as e:
                    self.message = f"第 {self.current_loop} 轮发生未知错误: {e}"
                    logger.error(f"User {self.user_id}, Car {self.car_number}: Unexpected error in loop {self.current_loop}: {e}")
                    break # 发生未知严重错误，终止任务

            if self.current_loop >= self.max_loops:
                self.status = "completed"
                self.message = "所有循环已完成"
                logger.info(f"Task for user {self.user_id} on car {self.car_number} completed.")
            else:
                self.status = "stopped"
                self.message = "任务已停止"
                logger.info(f"Task for user {self.user_id} on car {self.car_number} stopped.")

        finally:
            await client.close()
            if self.status not in ["completed", "stopped"]:
                self.status = "failed"
                logger.error(f"Task for user {self.user_id} on car {self.car_number} failed unexpectedly.")


    def stop(self):
        self._stop_event.set()
        self.message = "正在停止任务..."

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "car_number": self.car_number,
            "max_loops": self.max_loops,
            "current_loop": self.current_loop,
            "status": self.status,
            "message": self.message,
        }

# 全局任务管理器
# 结构: { "user_id": [Task1, Task2, ...] }
task_manager: Dict[str, List[ReservationTask]] = {}
