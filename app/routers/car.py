from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from ..sdk.seven_ma_sdk import SevenPaceAsyncClient, CarInfo, APIError
from ..dependencies import get_authenticated_client

router = APIRouter()

@router.get("/surrounding", response_model=List[dict])
async def get_surrounding_cars(
    latitude: float = Query(..., description="纬度"),
    longitude: float = Query(..., description="经度"),
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    获取周围的车辆
    """
    try:
        cars = await client.get_surrounding_cars(longitude, latitude)
        return [dict(car) for car in cars]
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.get("/{car_number}", response_model=dict)
async def get_car_info(
    car_number: str,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    获取车辆详细信息
    """
    try:
        car_info = await client.get_car_info(car_number)
        return dict(car_info)
    except APIError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await client.close()
