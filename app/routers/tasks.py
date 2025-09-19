import asyncio
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from ..dependencies import get_authenticated_client
from ..sdk.seven_ma_sdk import SevenPaceAsyncClient
from .. import models
from ..background import ReservationTask, task_manager

router = APIRouter()

@router.post("", response_model=models.MessageResponse)
async def create_reservation_task(
    request: models.OrderRequest, # Reusing OrderRequest for car_number
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    创建一个新的后台车辆预约任务
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id) # Convert int to str for dict key
    token = client.headers.get("authorization", "").replace("Bearer ", "")

    # 检查是否已有针对该车辆的任务
    if user_id in task_manager:
        for task in task_manager[user_id]:
            if task.car_number == request.car_number and task.status in ["pending", "running"]:
                raise HTTPException(status_code=400, detail=f"车辆 {request.car_number} 已存在一个运行中的任务")

    # 创建并启动任务
    new_task = ReservationTask(token=token, user_id=user_id, car_number=request.car_number)
    
    if user_id not in task_manager:
        task_manager[user_id] = []
    task_manager[user_id].append(new_task)
    
    asyncio.create_task(new_task.run())
    
    return models.MessageResponse(message=f"已为车辆 {request.car_number} 创建后台预约任务")

@router.get("", response_model=List[dict])
async def get_user_tasks(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    获取当前用户的所有后台任务状态
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id)

    if user_id not in task_manager:
        return []
    
    # 返回该用户的所有任务，包括已结束的，以便前端显示最终状态
    user_tasks = task_manager.get(user_id, [])
    return [task.to_dict() for task in user_tasks]

@router.delete("/{car_number}", response_model=models.MessageResponse)
async def stop_reservation_task(
    car_number: str,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    停止一个正在运行的后台任务
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id)

    if user_id not in task_manager:
        raise HTTPException(status_code=404, detail="未找到该用户的任务")

    task_to_stop = None
    for task in task_manager[user_id]:
        if task.car_number == car_number and task.status in ["pending", "running"]:
            task_to_stop = task
            break
    
    if not task_to_stop:
        raise HTTPException(status_code=404, detail=f"未找到车辆 {car_number} 正在运行的任务")

    task_to_stop.stop()
    
    # 可选：立即从列表中移除，或等待下次GET时自动清理
    # task_manager[user_id].remove(task_to_stop)

    return models.MessageResponse(message=f"已发送停止指令至车辆 {car_number} 的任务")
