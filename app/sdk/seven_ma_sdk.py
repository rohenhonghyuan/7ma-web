# -*- coding: utf-8 -*-
# based on README.md
import uuid
import httpx
from datetime import datetime
from dataclasses import dataclass
import msgpack, struct, base64
import websockets
from websockets.asyncio.client import ClientConnection
from websockets.protocol import State
import jwt
import asyncio
import os
import time
import enum
from rich import print

# --- 枚举类型，增强代码可读性和健壮性 ---
class UserSex(enum.IntEnum):
    """用户性别"""
    UNKNOWN = 0
    MALE = 1
    FEMALE = 2

class CarModel(enum.IntEnum):
    """车辆型号"""
    BICYCLE = 1  # 单车
    EBIKE = 2    # 电动车

class LockStatus(enum.IntEnum):
    """锁状态"""
    LOCKED = 1      # 已锁
    UNLOCKED = 2    # 未锁
    NO_STATUS = 3   # 无状态

class OrderState(enum.IntEnum):
    """订单状态"""
    CYCLING = 20         # 骑行中
    PENDING_PAYMENT = 30 # 待支付
    COMPLETED = 40       # 已完成

# --- 自定义异常 ---
class SevenMateError(Exception):
    """客户端基础异常"""
    pass

class APIError(SevenMateError):
    """API相关错误"""
    pass

class AuthenticationError(SevenMateError):
    """认证相关错误"""
    pass

# --- 数据类 ---
@dataclass(init=False)
class UserInfo:
    id: int  # 用户唯一标识，例如：1234567
    name: str  # 用户姓名，例如："张三"
    nickname: str  # 用户昵称，例如："user_nickname"
    avatar: str  # 用户头像URL，例如：""
    phone: str  # 用户手机号，例如："138****1234"
    sex: UserSex  # 用户性别
    admission_time: str  # 入学时间，例如："2023年 9月"
    wechat_openid: str  # 微信OpenID，例如："oFAKEs4mDBSY2uXGDx51UjOsZxFAKE"
    school_id: int  # 学校ID，例如：100
    school_name: str  # 学校名称，例如："示例大学"
    balance: str  # 账户余额，例如："10.00"
    points: int  # 用户积分，例如：100
    register_time: str  # 注册时间，例如："2023-09-01 10:00:00"
    client: str  # 客户端类型，例如："Wechat_MiniAPP"
    recent_finished_cycling_order_id: int  # 最近完成的骑行订单ID，例如：999999
    recent_finished_cycling_order_created_at: str  # 最近完成的骑行订单创建时间，例如："2025-01-01 10:00:00"
    current_cycling_order_state: int  # 当前骑行订单状态，例如：40
    current_cycling_order_id: int  # 当前骑行订单ID，例如：999999
    current_cycling_order_created_at: str  # 当前骑行订单创建时间，例如："2025-01-01 10:00:00"
    credits: int | None = None  # 用户信用分，例如：100

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            if key in self.__annotations__:
                if key == 'sex' and value is not None:
                    setattr(self, key, UserSex(value))
                else:
                    setattr(self, key, value)
    
    def __iter__(self):
        for key in self.__annotations__:
            yield (key, getattr(self, key))

@dataclass(init=False)
class CarInfo:
    number: str  # 车辆编号，例如："12345678"
    carmodel_id: CarModel  # 车辆型号ID
    longitude: float | None = None  # 车辆经度，例如：118.123
    latitude: float | None = None  # 车辆纬度，例如：32.456
    carmodel_name: str | None = None  # 车辆型号名称，例如："单车"
    lock_title: str | None = None  # 锁名称，例如："示例锁型号"
    lock_status: LockStatus | None = None  # 锁状态
    electricity: str | None = None # 电量，例如："100%"
    mileage: str | None = None  # 里程，例如："0.00km"
    allow_temporary_lock: int | None = None  # 是否允许临时锁车，例如：1 允许 0 不允许

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            if key in self.__annotations__:
                if key == 'carmodel_id' and value is not None:
                    setattr(self, key, CarModel(value))
                elif key == 'lock_status' and value is not None:
                    setattr(self, key, LockStatus(value))
                else:
                    setattr(self, key, value)

    def __iter__(self):
        for key in self.__annotations__:
            yield (key, getattr(self, key))

@dataclass(init=False)
class CyclingOrderInfo:
    order_id: int
    car_number: str
    carmodel_id: CarModel
    car_start_time: str
    car_end_time: str | None
    estimated_cost: str  # 预估费用（骑行中看这个）
    order_amount: str  # 订单金额（骑行中为0）
    order_state: OrderState
    electricity: str
    mileage: str
    created_at: str

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            if key in self.__annotations__:
                if key == 'carmodel_id' and value is not None:
                    setattr(self, key, CarModel(value))
                elif key == 'order_state' and value is not None:
                    setattr(self, key, OrderState(value))
                else:
                    setattr(self, key, value)
    
    def __iter__(self):
        for key in self.__annotations__:
            yield (key, getattr(self, key))

# --- WebSocket 客户端 ---
class SevenMateSocketClient:
    def __init__(self, user_id, socket_key, socket_url):
        self.user_id = user_id
        self.socket_key = socket_key
        self.uri = f"{socket_url}?sid={self.user_id}"
        self.websocket: ClientConnection | None = None
        self.msg_id_counter = 1

    def _calculate_auth_code(self):
        """根据socketKey计算auth_code"""
        try:
            key_bytes = bytes.fromhex(self.socket_key)
            if len(key_bytes) != 16:
                raise ValueError("Socket key must be 16 bytes (32 hex chars)")
            
            auth_bytes = bytearray(16)
            for i in range(len(key_bytes) - 1):
                auth_bytes[i] = key_bytes[i] ^ key_bytes[i + 1]
            auth_bytes[15] = key_bytes[15] ^ auth_bytes[0]
            
            return base64.b64encode(auth_bytes).decode('utf-8')
        except Exception as e:
            print(f"计算 auth_code 时出错: {e}")
            return None

    def _create_packet(self, action_id, data_payload):
        """创建二进制数据包"""
        packed_data = msgpack.packb(data_payload, use_bin_type=True)
        assert packed_data is not None
        # 头部使用大端序 (>)
        # I = 4-byte unsigned integer
        header = struct.pack('>III', self.msg_id_counter, action_id, len(packed_data))
        self.msg_id_counter += 1
        return header + packed_data

    async def _send_packet(self, action_id, data_payload):
        """创建并发送数据包"""
        if not self.websocket or self.websocket.state != State.OPEN:
            raise ConnectionError("WebSocket 未连接。")
        
        packet = self._create_packet(action_id, data_payload)
        await self.websocket.send(packet)

    async def connect(self):
        """连接并认证"""
        self.websocket = await websockets.connect(self.uri)
        auth_code = self._calculate_auth_code()
        if not auth_code:
            await self.close()
            raise AuthenticationError("无法生成 auth_code。")

        auth_payload = {"data": {"auth_code": auth_code}}
        await self._send_packet(action_id=1, data_payload=auth_payload)

    async def unlock_car(self):
        """发送解锁车辆的指令"""
        payload = {
            "user_id": self.user_id,
            "scene": {"fn": str(uuid.uuid4()), "showMessage": True},
            "headers": {
                "Accept": "application/vnd.ws.v1+json",
                "Client": "Wechat_MiniAPP",
                "Phone-Model": "Mac14,15",
                "Phone-Brand": "apple",
                "Phone-System": "Android",
                "Phone-System-Version": "Mac OS X 15.6.1 arm64",
                "App-Version": "1.3.129"
            },
            "data": {
                "action_type": 1
            }
        }
        await self._send_packet(3002, payload)

    async def temporary_lock_car(self):
        """发送临时上锁的指令"""
        payload = {
            "user_id": self.user_id,
            "scene": {"fn": str(uuid.uuid4()), "showMessage": True},
            "headers": {
                "Accept": "application/vnd.ws.v1+json",
                "Client": "Wechat_MiniAPP",
                "Phone-Model": "Mac14,15",
                "Phone-Brand": "apple",
                "Phone-System": "Android",
                "Phone-System-Version": "Mac OS X 15.6.1 arm64",
                "App-Version": "1.3.129"
            },
            "data": {
                "back_type": None,
                "action_type": 1
            }
        }
        await self._send_packet(3003, payload)

    async def close(self):
        """关闭连接"""
        if self.websocket:
            await self.websocket.close()

# --- 异步 HTTP 客户端 (httpx) ---
class SevenPaceAsyncClient:
    def __init__(self, authorization: str | None = None, expired_at: str = ""):
        self.base_url = "https://newmapi.7mate.cn/api/"
        self.headers = {
            # "phone-model": "Mac14,15", # 该字段会导致设备限制
            "phone-system": "Android", 
            "client": "Wechat_MiniAPP",
            "phone-system-version": "Mac OS X 15.3.1",
            "content-type": "application/json",
            "accept": "application/vnd.ws.v1+json",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 MicroMessenger/6.8.0(0x16080000) NetType/WIFI MiniProgramEnv/Mac MacWechat/WMPF MacWechat/3.8.10(0x13080a10) XWEB/1227",
            "xweb_xhr": "1",
            "phone-brand": "apple",
            "app-version": "1.3.91",
            "sec-fetch-site": "cross-site", 
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "referer": "https://servicewechat.com/wx9a6a1a8407b04c5d/246/page-frame.html",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "zh-CN,zh;q=0.9"
        }
        if authorization:
            self.headers["authorization"] = authorization
        self.expired_at = expired_at
        self.http_client = httpx.AsyncClient()

    def set_token(self, token: str, expired_at: str | None = ""):
        """设置认证令牌"""
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
        except jwt.exceptions.DecodeError as e:
            raise AuthenticationError(f"无效的Token: {e}")
        
        self.headers["authorization"] = f"Bearer {token}"
        if not expired_at:
            exp_timestamp = payload.get("exp", 0)
            self.expired_at = datetime.fromtimestamp(exp_timestamp).strftime("%Y-%m-%d %H:%M:%S")
        else:
            self.expired_at = expired_at

    async def _request(self, method: str, endpoint: str, **kwargs):
        """通用请求方法"""
        url = f"{self.base_url}{endpoint}"
        response = await self.http_client.request(method, url, headers=self.headers, **kwargs)
        
        if response.status_code >= 400:
            raise APIError(f"请求失败，状态码: {response.status_code}, 内容: {response.text}")
        
        json_response = response.json()
        if "status_code" in json_response and json_response["status_code"] != 200:
            raise APIError(json_response.get("message", "未知的API错误"))
            
        return json_response

    async def get_sms_code(self, phone: str | int):
        """获取短信验证码"""
        data = {"phone": phone, "scene": 1}
        response = await self._request("POST", "verificationcode", json=data)
        return response.get("message")

    async def login(self, phone: str | int, code: str | int):
        """登录"""
        data = {"phone": phone, "verification_code": code}
        response = await self.http_client.post(f"{self.base_url}authorizations", json=data, headers=self.headers)
        response.raise_for_status()
        json_res = response.json()
        if "status_code" in json_res:
            raise APIError(json_res.get("message"))
        
        token_data = json_res['data']
        self.set_token(token_data['token'], token_data['expired_at'])
        return "登录成功"

    async def get_user_info(self, need_credits=False) -> UserInfo:
        """获取用户信息"""
        response = await self._request("GET", "user")
        user_data = response.get("data", {})
        user_info = UserInfo(**user_data)
        
        if need_credits:
            credits_response = await self.get_user_credits()
            user_info.credits = credits_response.get("data", {}).get("credit_scores")
            
        return user_info

    async def get_ws_connection_info(self) -> dict:
        """获取WebSocket连接信息"""
        response = await self._request("GET", "user?socket=1")
        data = response.get("data", {})
        return {
            "socket_url": data.get("socketUrl"),
            "sid": data.get("id"),
            "socket_key": data.get("socketKey")
        }

    async def get_user_credits(self) -> dict:
        """获取用户信用分"""
        return await self._request("GET", "user/credit_scores")

    async def query_cmd(self, cmd: str) -> str:
        """查询指令状态"""
        response = await self._request("GET", f"cmd/query/{cmd}")
        ret = response.get("data", {}).get("ret")
        if ret == 1:
            return "成功"
        elif ret == 0:
            return "处理中"
        elif ret == 2:
            raise APIError("成功但有异常")
        elif ret == 3:
            raise APIError("车辆离线")
        elif ret == 4:
            raise APIError("失败")
        else:
            raise APIError(f"未知指令状态: {ret}")

    async def check_authority(self) -> str:
        """检查用户是否有权限"""
        response = await self._request("GET", "user/car_authority")
        unauthorized_code = response.get("data", {}).get("unauthorized_code")
        error_messages = {
            1: "未登录", 2: "未实名认证", 3: "实名认证中", 4: "实名认证失败",
            5: "未充值或购买套餐卡", 6: "有进行中行程", 7: "有未支付订单",
            8: "有待支付调度费", 9: "有待支付赔偿费"
        }
        if unauthorized_code == 0:
            return "有权限"
        else:
            message = error_messages.get(unauthorized_code, "未知错误")
            raise APIError(message)

    async def order_car(self, car_number: str) -> str:
        """下单共享单车（但不开锁）"""
        data = {"order_type": 1, "car_number": car_number}
        response = await self._request("POST", "order", json=data)
        return response.get("message")

    async def unlock_car(self):
        """解锁车辆（通过WebSocket）"""
        ws_info = await self.get_ws_connection_info()
        ws_client = SevenMateSocketClient(ws_info.get("sid"), ws_info.get("socket_key"), ws_info.get("socket_url"))
        try:
            await ws_client.connect()
            await asyncio.sleep(0.2)  # 等待认证完成
            await ws_client.unlock_car()
        finally:
            await ws_client.close()

    async def temporary_lock_car(self):
        """临时锁车（通过WebSocket）"""
        ws_info = await self.get_ws_connection_info()
        ws_client = SevenMateSocketClient(ws_info.get("sid"), ws_info.get("socket_key"), ws_info.get("socket_url"))
        try:
            await ws_client.connect()
            await asyncio.sleep(0.2)  # 等待认证完成
            await ws_client.temporary_lock_car()
        finally:
            await ws_client.close()

    async def temporary_lock_car_http(self) -> str:
        """临时锁车（通过HTTP）"""
        data = {"action_type": 1}
        response = await self._request("POST", "car/lock", json=data)
        return response.get("data", {}).get("cmd")

    async def back_car(self) -> str:
        """还车"""
        data = {"action_type": 2}
        response = await self._request("POST", "car/lock", json=data)
        return response.get("data", {}).get("cmd")

    async def get_surrounding_cars(self, longitude: float, latitude: float) -> list[CarInfo]:
        """获取周围车辆（只能拿到车辆编号，车辆类型，车辆位置这几个信息"""
        params = {"longitude": longitude, "latitude": latitude}
        response = await self._request("GET", "surrounding/car", params=params)
        car_list_data = response.get("data", [])
        return [CarInfo(**car) for car in car_list_data]

    async def get_car_info(self, car_number: str, need_location=True) -> CarInfo:
        """获取车辆信息"""
        response = await self._request("GET", f"car/{car_number}")
        car_data = response.get("data", {})
        car_info = CarInfo(**car_data)

        if need_location:
            location_response = await self.get_car_location(car_number)
            location_data = location_response.get("data", {})
            car_info.longitude = location_data.get("longitude")
            car_info.latitude = location_data.get("latitude")
        
        return car_info

    async def get_car_location(self, car_number: str) -> dict:
        """获取车辆位置"""
        return await self._request("GET", f"car/{car_number}/location")

    async def current_cycling_order(self) -> "CyclingOrderInfo":
        """获取当前骑行订单"""
        response = await self._request("GET", "order/cycling")
        data = response.get("data")
        if not data:
            raise APIError("无骑行订单")
        return CyclingOrderInfo(**data)

    async def get_unpaid_order(self) -> dict | None:
        """获取未支付的订单信息"""
        try:
            await self.check_authority()
            return None # 有权限，说明没有未支付订单
        except APIError as e:
            if "有未支付订单" in str(e):
                user_info = await self.get_user_info()
                if user_info.recent_finished_cycling_order_id:
                    return {
                        "order_id": user_info.recent_finished_cycling_order_id,
                        "created_at": user_info.recent_finished_cycling_order_created_at
                    }
            return None # 其他权限问题或没有订单ID

    async def pay_with_balance(self, order_id: str | int, order_time: str) -> str:
        """余额支付"""
        data = {
            "payment_id": 1, "order_id": str(order_id),
            "order_type": 1, "created_at": order_time
        }
        await self._request("POST", "payment/pay", json=data)
        return "支付成功"

    async def signin(self) -> str:
        """签到"""
        response = await self._request("POST", "signin", json={})
        return response.get("data", {}).get("desc")

    async def close(self):
        """关闭HTTP客户端"""
        await self.http_client.aclose()

async def main():
    client = SevenPaceAsyncClient()
    # 替换为你的Token
    # 注意：出于安全考虑，这里的Token已被替换为无法使用的示例值。
    client.set_token("eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczpcL1wvZmFrZS1hcGkuZXhhbXBsZS5jb21cL2FwaVwvbG9naW4iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTgwMDAwMDAwMCwibmJmIjoxNzAwMDAwMDAwLCJqdGkiOiJmYWtlX2p0aSIsInN1YiI6MTIzNDU2NywicHJ2IjoiZmFrZV9wcnYifQ.fake_signature_string_for_demo")

    try:
        # # 登陆
        # print("[cyan]--- 1. 登录 ---[/cyan]")
        # try:
        #     message = await client.get_sms_code("13800138000")
        #     print(f"[green]获取验证码成功:[/green] {message}")
        #     code = input("请输入验证码: ")
        #     message = await client.login("13800138000", code)
        #     print(f"[bold green]登录成功![/bold green]")
        #     print(f"  [bold]Token:[/bold] {client.headers['authorization'].split(' ')[1][:30]}...")
        #     print(f"  [bold]Expired at:[/bold] {client.expired_at}")
        # except (APIError, AuthenticationError) as e:
        #     print(f"[bold red]登录失败:[/bold red] {e}")
        #     return

        # 0. 检查用户权限
        print("[cyan]--- 0. 检查用户权限 ---[/cyan]")
        try:
            message = await client.check_authority()
            print(f"[green]权限正常:[/green] {message}")
        except APIError as e:
            print(f"[bold red]权限异常:[/bold red] {e}")

        # 1. 获取用户信息
        print("[cyan]--- 1. 获取用户信息 ---[/cyan]")
        try:
            user_info = await client.get_user_info()
            print(user_info)
        except APIError as e:
            print(f"[bold red]获取用户信息失败:[/bold red] {e}")

        # 2. 获取周围车辆
        print("[cyan]--- 2. 获取周围车辆 ---[/cyan]")
        try:
            cars = await client.get_surrounding_cars(118.70762235331449, 32.205375942712834)
            print(f"[green]获取到 {len(cars)} 辆车:[/green]")
            for car in cars:
                print(car)
        except APIError as e:
            print(f"[bold red]获取周围车辆失败:[/bold red] {e}")

        # 3. 选一个合适的车辆，查看具体信息
        print("[cyan]--- 3. 查看车辆信息 ---[/cyan]")
        try:
            car_info = await client.get_car_info("23113216")
            print(car_info)
        except APIError as e:
            print(f"[bold red]获取车辆信息失败:[/bold red] {e}")

        # # 4. 下单
        # print("[cyan]--- 4. 下单 ---[/cyan]")
        # try:
        #     message = await client.order_car("23113216")
        #     print(f"[green]下单成功:[/green]")
        # except APIError as e:
        #     print(f"[bold red]下单失败:[/bold red] {e}")

        # # 5. 解锁
        # print("[cyan]--- 5. 解锁车辆 ---[/cyan]")
        # try:
        #     await client.unlock_car()
        #     print("[green]解锁指令已发送[/green]")
        # except (APIError, ConnectionError) as e:
        #     print(f"[bold red]解锁过程中发生错误:[/bold red] {e}")

        # # 6. 临时锁车 (WebSocket)
        # print("[cyan]--- 6. 临时锁车 (WebSocket) ---[/cyan]")
        # try:
        #     await client.temporary_lock_car()
        #     print("[green]临时锁车(WebSocket)指令已发送[/green]")
        # except (APIError, ConnectionError) as e:
        #     print(f"[bold red]临时锁车(WebSocket)过程中发生错误:[/bold red] {e}")

        # # 6.1 临时锁车 (HTTP)
        # print("[cyan]--- 6.1 临时锁车 (HTTP) ---[/cyan]")
        # try:
        #     cmd = await client.temporary_lock_car_http()
        #     print(f"[green]临时锁车(HTTP)指令已发送:[/green] {cmd}")
        # except APIError as e:
        #     print(f"[bold red]临时锁车(HTTP)过程中发生错误:[/bold red] {e}")

        # # 7. 开锁 (同5)
        # print("[cyan]--- 7. 再次解锁车辆 ---[/cyan]")
        # try:
        #     await client.unlock_car()
        #     print("[green]开锁指令已发送[/green]")
        # except (APIError, ConnectionError) as e:
        #     print(f"[bold red]开锁过程中发生错误:[/bold red] {e}")

        # # 8. 还车
        # print("[cyan]--- 8. 还车 ---[/cyan]")
        # try:
        #     cmd = await client.back_car()
        #     print(f"[green]还车指令已发送:[/green] {cmd}")
        # except APIError as e:
        #     print(f"[bold red]还车失败:[/bold red] {e}")
        
        # print("[yellow]等待5秒确保订单状态更新...[/yellow]")
        # await asyncio.sleep(5)

        # 9. 获取当前骑行订单
        print("[cyan]--- 9. 获取当前骑行订单 ---[/cyan]")
        try:
            order = await client.current_cycling_order()
            print(order)
            # # 10. 余额支付
            # print("[cyan]--- 10. 余额支付 ---[/cyan]")
            # try:
            #     message = await client.pay_with_balance(order.order_id, order.created_at)
            #     print(f"[green]支付成功:[/green] {message}")
            # except APIError as e:
            #     print(f"[bold red]支付失败:[/bold red] {e}")
        except APIError as e:
            print(f"[bold red]获取订单失败:[/bold red] {e}")

        # # 11. 签到
        # print("[cyan]--- 11. 签到 ---[/cyan]")
        # try:
        #     message = await client.signin()
        #     print(f"[green]签到成功:[/green] {message}")
        # except APIError as e:
        #     print(f"[bold red]签到失败:[/bold red] {e}")

    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
