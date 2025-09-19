from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from ..dependencies import get_authenticated_client
from ..sdk.seven_ma_sdk import SevenPaceAsyncClient
from .. import models
from ..scheduler import scheduler_manager

router = APIRouter()

@router.post("", response_model=Dict[str, Any])
async def create_periodic_task(
    request: models.PeriodicTaskCreate,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    创建一个新的周期性任务
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id)
    token = client.headers.get("authorization", "").replace("Bearer ", "")

    task_config = request.dict()
    task_config["user_id"] = user_id
    task_config["token"] = token

    try:
        new_task = scheduler_manager.add_task(task_config)
        return new_task
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"创建任务失败: {e}")

@router.get("", response_model=List[Dict[str, Any]])
async def get_periodic_tasks(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    获取当前用户的所有周期性任务
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id)
    return scheduler_manager.get_tasks_for_user(user_id)

@router.put("/{task_id}", response_model=Dict[str, Any])
async def update_periodic_task(
    task_id: str,
    request: models.PeriodicTaskCreate,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    更新一个现有的周期性任务
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id)
    token = client.headers.get("authorization", "").replace("Bearer ", "")

    updates = request.dict()
    updates["token"] = token # 强制使用最新的token

    try:
        updated_task = scheduler_manager.update_task(task_id, user_id, updates)
        return updated_task
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新任务失败: {e}")

@router.delete("/{task_id}", response_model=models.MessageResponse)
async def delete_periodic_task(
    task_id: str,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    删除一个周期性任务
    """
    user_info = await client.get_user_info()
    user_id = str(user_info.id)
    try:
        scheduler_manager.remove_task(task_id, user_id)
        return models.MessageResponse(message="任务已删除")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除任务失败: {e}")
