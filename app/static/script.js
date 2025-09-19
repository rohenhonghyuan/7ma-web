import * as React from 'react';
import { createRoot } from 'react-dom/client';
import {
    ThemeProvider, createTheme, CssBaseline, Container, Box, Typography, TextField, Button, Tabs, Tab, Card, CardContent, CardActions,
    Alert, BottomNavigation, BottomNavigationAction, Paper, List, ListItem, ListItemText, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, Chip, CircularProgress, AppBar, Toolbar, Fab, Accordion, AccordionSummary, AccordionDetails, Snackbar,
    Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import {
    Home as HomeIcon, Person as PersonIcon, Delete as DeleteIcon, MyLocation as MyLocationIcon, Add as AddIcon, CloudUpload as CloudUploadIcon,
    CloudDownload as CloudDownloadIcon, ExpandMore as ExpandMoreIcon, Lock as LockIcon, LockOpen as LockOpenIcon, Replay as ReplayIcon,
    North as NorthIcon, Navigation as NavigationIcon, Dns as DnsIcon, QrCodeScanner as QrCodeScannerIcon, Map as MapIcon
} from '@mui/icons-material';

import { getCurrentPosition as getAMapPosition } from '/static/amap.js';

const { useState, useEffect, useCallback, useMemo, useRef } = React;

const API_BASE_URL = '/api';

// --- Custom Hooks ---
function useLocalStorage(key, initialValue) {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) { console.log(error); return initialValue; }
    });
    const setValue = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) { console.log(error); }
    };
    return [storedValue, setValue];
}

function useCurrentPosition() {
    const [position, setPosition] = useLocalStorage('userPosition', null);
    const [error, setError] = useState(null);

    const fetchPosition = useCallback(async () => {
        // Only fetch if position is not already set
        if (!position) {
            try {
                console.log("Fetching initial position...");
                const pos = await getAMapPosition();
                setPosition(pos.coords);
            } catch (err) {
                console.error("Failed to get initial position:", err);
                setError(err.message);
            }
        }
    }, [position, setPosition]);

    useEffect(() => {
        fetchPosition();
    }, [fetchPosition]);

    // The value is an array [position, setPosition], we just return the position object
    return { position: position, error, setPosition };
}

// --- API Helper ---
async function getCurrentPositionWithOffset() {
    const storedPosition = window.localStorage.getItem('userPosition');
    if (storedPosition && storedPosition !== 'null') {
        return { coords: JSON.parse(storedPosition) };
    }
    return await getAMapPosition();
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    const token = localStorage.getItem('authToken');
    if (token) { options.headers['Authorization'] = `Bearer ${token}`; }
    if (body) { options.body = JSON.stringify(body); }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    if (!response.ok) {
        if (response.status === 401) {
            return { error: 'unauthorized' };
        }
        const errorData = await response.json();
        throw new Error(errorData.detail || 'API request failed');
    }
    if (response.status === 204) return null;
    return response.json();
}

// --- Helper Functions ---
const getLockStatusText = (status) => ({ 1: '已锁', 2: '未锁', 3: '无状态' }[status] || '未知');
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { return null; }
}
function getDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat) / 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon)) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}
function getBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

// --- Components ---

function Compass({ carPosition, size = 'medium' }) {
    const { position: userPosition } = useCurrentPosition();
    const [heading, setHeading] = useState(0);

    useEffect(() => {
        const handleOrientation = (event) => {
            let newHeading = 0;
            if (event.webkitCompassHeading) { // iOS
                newHeading = event.webkitCompassHeading;
            } else if (event.alpha) { // Android
                newHeading = 360 - event.alpha;
            }
            setHeading(newHeading);
        };
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', handleOrientation);
            return () => window.removeEventListener('deviceorientation', handleOrientation);
        }
    }, []);

    if (!userPosition || !carPosition) return null;

    const bearing = getBearing(userPosition.latitude, userPosition.longitude, carPosition.latitude, carPosition.longitude);
    const carDirection = bearing - heading;
    const distance = getDistance(userPosition.latitude, userPosition.longitude, carPosition.latitude, carPosition.longitude);

    const iconSize = size === 'small' ? 24 : 40;
    const boxSize = size === 'small' ? 32 : 60;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: boxSize }}>
            <Box sx={{ width: boxSize, height: boxSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <NavigationIcon sx={{ fontSize: iconSize, color: 'primary.main', transform: `rotate(${carDirection}deg)`, transition: 'transform 0.3s ease' }} />
            </Box>
            {distance !== null && (
                <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                    {(distance * 1000).toFixed(0)}m
                </Typography>
            )}
        </Box>
    );
}

function LoginPage({ onLoginSuccess, showSnackbar }) {
    const [loginType, setLoginType] = useState(0);
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [token, setToken] = useState('');

    const handleGetCode = async () => {
        try {
            const res = await apiCall('/auth/sms_code', 'POST', { phone });
            showSnackbar(res.message, 'success');
        } catch (err) { showSnackbar(err.message, 'error'); }
    };
    const handleLogin = async () => {
        try {
            if (loginType === 0) {
                onLoginSuccess((await apiCall('/auth/login', 'POST', { phone, code })).token);
            } else {
                await apiCall('/auth/token_login', 'POST', { token });
                onLoginSuccess(token);
            }
        } catch (err) { showSnackbar(err.message, 'error'); }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography component="h1" variant="h5">登录 7ma-web</Typography>
                <Box sx={{ width: '100%', mt: 3, borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={loginType} onChange={(e, v) => setLoginType(v)} centered>
                        <Tab label="手机号登录" />
                        <Tab label="Token 登录" />
                    </Tabs>
                </Box>
                <Box component="form" sx={{ mt: 1, width: '100%' }}>
                    {loginType === 0 ? (
                        <>
                            <TextField margin="normal" required fullWidth label="手机号" value={phone} onChange={e => setPhone(e.target.value)} />
                            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, mt: 2, mb: 1 }}>
                                <TextField required fullWidth label="验证码" value={code} onChange={e => setCode(e.target.value)} />
                                <Button variant="outlined" onClick={handleGetCode} sx={{ whiteSpace: 'nowrap', mb: '7px' }}>获取验证码</Button>
                            </Box>
                        </>
                    ) : (
                        <TextField margin="normal" required fullWidth multiline rows={4} label="粘贴 Token 此处" value={token} onChange={e => setToken(e.target.value)} />
                    )}
                    <Button fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} onClick={handleLogin}>登录</Button>
                </Box>
            </Box>
        </Container>
    );
}

function CyclingBanner({ order, carInfo, onAction }) {
    const [duration, setDuration] = useState('00:00:00');
    const [expanded, setExpanded] = useState(true);
    const isLocked = carInfo && carInfo.lock_status === 1;
    const isCycling = order.order_state === 20;

    useEffect(() => {
        if (!isCycling) return;
        const timer = setInterval(() => {
            const diff = Math.floor((new Date() - new Date(order.car_start_time.replace(/-/g, '/'))) / 1000);
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            setDuration(`${h}:${m}:${s}`);
        }, 1000);
        return () => clearInterval(timer);
    }, [order.car_start_time, isCycling]);

    return (
        <Paper sx={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 10, m: 2, borderRadius: 4 }}>
            <Box 
                onClick={() => setExpanded(!expanded)} 
                sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
                <Typography>{isCycling ? `骑行中 - ${duration}` : "已预约"} | 费用: {order.estimated_cost} 元</Typography>
                <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
            </Box>
            {expanded && (
                <Box sx={{ px: 2, pb: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                        <Typography variant="body2">车辆编号: {order.car_number}</Typography>
                        <Typography variant="body2">电量: {order.electricity}% | 状态: {getLockStatusText(carInfo?.lock_status)}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                            {!isCycling ? (
                                <Button variant="contained" color="success" onClick={() => onAction('unlock')} startIcon={<LockOpenIcon />}>解锁车辆</Button>
                            ) : isLocked ? (
                                <Button variant="contained" color="success" onClick={() => onAction('unlock')} startIcon={<LockOpenIcon />}>开锁</Button>
                            ) : (
                                <Button variant="contained" color="warning" onClick={() => onAction('lock')} startIcon={<LockIcon />}>临时锁车</Button>
                            )}
                            <Button variant="contained" color="error" onClick={() => onAction('return')} startIcon={<ReplayIcon />}>还车/取消</Button>
                        </Box>
                    </Box>
                    {carInfo && <Compass carPosition={{ latitude: carInfo.latitude, longitude: carInfo.longitude }} />}
                </Box>
            )}
        </Paper>
    );
}

function QrScannerDialog({ open, onClose, onScanSuccess, showSnackbar }) {
    const scannerRef = useRef(null);

    // This effect is for cleanup only. It runs when the component unmounts.
    useEffect(() => {
        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(err => {
                    console.error("Failed to stop scanner on cleanup", err);
                });
            }
        };
    }, []);

    // A callback ref that gets called when the div is mounted to the DOM.
    const qrReaderRef = useCallback((node) => {
        if (node !== null) {
            // The div is mounted, so we can safely initialize the scanner.
            const html5QrCode = new Html5Qrcode(node.id);
            scannerRef.current = html5QrCode;

            const qrCodeSuccessCallback = (decodedText, decodedResult) => {
                try {
                    const url = new URL(decodedText);
                    if (url.hostname === 'www.7mate.cn' && url.pathname === '/app.php') {
                        const randnum = url.searchParams.get('randnum');
                        if (randnum) {
                            onScanSuccess(randnum);
                            onClose();
                        } else {
                            showSnackbar('二维码格式无效 (缺少 randnum)', 'warning');
                        }
                    } else {
                        showSnackbar('非指定的二维码', 'warning');
                    }
                } catch (e) {
                    showSnackbar('无法解析二维码内容', 'error');
                }
            };
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };

            html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
                .catch(err => {
                    console.error("Unable to start scanning", err);
                    showSnackbar('无法启动摄像头', 'error');
                });
        }
    }, [onClose, onScanSuccess, showSnackbar]);

    return (
        <Dialog open={open} onClose={onClose} fullScreen>
            <AppBar sx={{ position: 'relative' }}>
                <Toolbar>
                    <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
                        扫描车辆二维码
                    </Typography>
                    <Button autoFocus color="inherit" onClick={onClose}>
                        关闭
                    </Button>
                </Toolbar>
            </AppBar>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div id="qr-reader" ref={qrReaderRef} style={{ width: '100%', maxWidth: '500px' }}></div>
            </Box>
        </Dialog>
    );
}

function HomePage({ user, onRefresh, setCurrentOrder, setCyclingCarInfo, showSnackbar }) {
    const [surroundingCars, setSurroundingCars] = useState([]);
    const [carNumberInput, setCarNumberInput] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [selectedCar, setSelectedCar] = useState(null);
    const [loading, setLoading] = useState(false);
    const [favoritePlaces, setFavoritePlaces] = useLocalStorage('favoritePlaces', []);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newPlace, setNewPlace] = useState({ name: '', lat: '', lon: '' });
    const [promptDialog, setPromptDialog] = useState({ open: false, title: '', label: '', multiline: false, value: '', onConfirm: () => {} });
    const [carTypeFilter, setCarTypeFilter] = useState('all');
    const [sortCriteria, setSortCriteria] = useState('distance');

    const sortedAndFilteredCars = useMemo(() => {
        return [...surroundingCars]
            .filter(c => carTypeFilter === 'all' || c.carmodel_id === carTypeFilter)
            .sort((a, b) => {
                if (sortCriteria === 'distance') return (a.distance ?? Infinity) - (b.distance ?? Infinity);
                if (!a.detailsFetched || !b.detailsFetched) return 0;
                if (sortCriteria === 'electricity') return (parseInt(b.electricity) || 0) - (parseInt(a.electricity) || 0);
                if (sortCriteria === 'mileage') return (parseFloat(b.mileage) || 0) - (parseFloat(a.mileage) || 0);
                return 0;
            });
    }, [surroundingCars, carTypeFilter, sortCriteria]);

    const handleGetSurroundingCars = useCallback(async (latitude, longitude) => {
        setLoading(true);
        setSurroundingCars([]);
        try {
            const initialCars = await apiCall(`/cars/surrounding?latitude=${latitude}&longitude=${longitude}`);
            const carsWithDistance = initialCars.map(car => ({
                ...car,
                detailsFetched: false,
                distance: getDistance(latitude, longitude, car.latitude, car.longitude)
            }));
            carsWithDistance.sort((a, b) => a.distance - b.distance);
            setSurroundingCars(carsWithDistance);
        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const fetchDetailsSequentially = async () => {
            const carsToLoad = sortedAndFilteredCars.slice(0, 10);
            for (const car of carsToLoad) {
                if (!car.detailsFetched) {
                    try {
                        const carDetails = await apiCall(`/cars/${car.number}`);
                        setSurroundingCars(prevCars => {
                            const newCars = [...prevCars];
                            const carIndex = newCars.findIndex(c => c.number === carDetails.number);
                            if (carIndex !== -1) {
                                newCars[carIndex] = { ...newCars[carIndex], ...carDetails, detailsFetched: true };
                            }
                            return newCars;
                        });
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (err) {
                        console.error(`Failed to fetch details for car ${car.number}:`, err);
                    }
                }
            }
        };
        if (sortedAndFilteredCars.length > 0) {
            fetchDetailsSequentially();
        }
    }, [sortedAndFilteredCars.map(c => c.number).join(',')]); // Depend on the sorted/filtered list

    const handleSelectCar = async (carNumber) => {
        const carInList = surroundingCars.find(c => c.number === carNumber);
        if (carInList && carInList.detailsFetched) {
            setSelectedCar(carInList);
            return;
        }
        setLoading(true);
        try {
            const carDetails = await apiCall(`/cars/${carNumber}`);
            setSurroundingCars(prevCars => {
                const newCars = [...prevCars];
                const carIndex = newCars.findIndex(c => c.number === carDetails.number);
                if (carIndex !== -1) {
                    newCars[carIndex] = { ...newCars[carIndex], ...carDetails, detailsFetched: true };
                }
                return newCars;
            });
            setSelectedCar({ ...carInList, ...carDetails });
        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleGetCurrentLocationCars = () => getCurrentPositionWithOffset().then(pos => handleGetSurroundingCars(pos.coords.latitude, pos.coords.longitude), () => showSnackbar("无法获取位置", 'error'));
    const handleOrderCar = async (carNumber) => {
        try {
            const res = await apiCall('/orders', 'POST', { car_number: carNumber });
            showSnackbar(res.message, 'success');

            // Optimistic update
            const optimisticOrder = {
                car_number: selectedCar.number,
                order_state: 10, // Booked state
                estimated_cost: '0.00',
                electricity: selectedCar.electricity,
            };
            setCurrentOrder(optimisticOrder);
            setCyclingCarInfo(selectedCar);
            setSelectedCar(null); // Hide the details card

            setTimeout(onRefresh, 21000);
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
    const handleReserveCar = async (carNumber) => {
        try {
            const res = await apiCall('/tasks', 'POST', { car_number: carNumber });
            showSnackbar(res.message, 'success');
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
    const handleAddPlace = () => {
        if (newPlace.name && newPlace.lat && newPlace.lon) {
            setFavoritePlaces(p => [...p, newPlace]);
            setNewPlace({ name: '', lat: '', lon: '' });
            setDialogOpen(false);
        }
    };
    const handleAddCurrentLocation = () => getCurrentPositionWithOffset().then(pos => {
        setPromptDialog({
            open: true,
            title: '输入位置名称',
            label: '名称',
            multiline: false,
            onConfirm: (name) => {
                if (name) setFavoritePlaces(p => [...p, { name, lat: pos.coords.latitude, lon: pos.coords.longitude }]);
            }
        });
    }, () => showSnackbar("无法获取位置", 'error'));
    const handleExport = () => navigator.clipboard.writeText(JSON.stringify(favoritePlaces)).then(() => showSnackbar("已复制", 'success'));
    const handleImport = () => {
        setPromptDialog({
            open: true,
            title: '导入常用地点',
            label: '粘贴数据',
            multiline: true,
            onConfirm: (json) => {
                try { if (json) setFavoritePlaces(JSON.parse(json)); } catch (e) { showSnackbar("格式错误", 'error'); }
            }
        });
    };

    const handleScanSuccess = (carNumber) => {
        setCarNumberInput(carNumber);
        handleSelectCar(carNumber);
    };

    return (
        <Container sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {scannerOpen && (
                <QrScannerDialog
                    open={scannerOpen}
                    onClose={() => setScannerOpen(false)}
                    onScanSuccess={handleScanSuccess}
                    showSnackbar={showSnackbar}
                />
            )}
            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">常用地点</Typography>
                        <Box>
                            <IconButton onClick={handleImport}><CloudUploadIcon /></IconButton>
                            <IconButton onClick={handleExport}><CloudDownloadIcon /></IconButton>
                            <IconButton onClick={handleAddCurrentLocation}><MyLocationIcon /></IconButton>
                            <IconButton onClick={() => setDialogOpen(true)}><AddIcon /></IconButton>
                        </Box>
                    </Box>
                    <List>
                        {favoritePlaces.map(p => (
                            <ListItem
                                key={p.name}
                                secondaryAction={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Compass carPosition={{ latitude: parseFloat(p.lat), longitude: parseFloat(p.lon) }} size="small" />
                                        <IconButton edge="end" onClick={(e) => { e.stopPropagation(); setFavoritePlaces(favs => favs.filter(f => f.name !== p.name)); }}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                }
                            >
                                <ListItemText
                                    primary={p.name}
                                    secondary={`${p.lat}, ${p.lon}`}
                                    onClick={() => handleGetSurroundingCars(p.lat, p.lon)}
                                    sx={{ cursor: 'pointer' }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </CardContent>
            </Card>
            <Card>
                <CardContent>
                    <Typography variant="h6">用车</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                        <TextField label="车辆编号" size="small" value={carNumberInput} onChange={e => setCarNumberInput(e.target.value)} fullWidth />
                        <IconButton color="primary" onClick={() => setScannerOpen(true)}><QrCodeScannerIcon /></IconButton>
                        <Button variant="contained" onClick={() => handleSelectCar(carNumberInput)}>查询</Button>
                    </Box>
                    <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={handleGetCurrentLocationCars} startIcon={<MyLocationIcon />}>查找附近车辆</Button>
                </CardContent>
            </Card>
            {selectedCar && (
                <Card>
                    <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="h6">车辆详情</Typography>
                            <Typography>编号: {selectedCar.number}</Typography>
                            <Typography>型号: {selectedCar.carmodel_name}</Typography>
                            <Typography>状态: {getLockStatusText(selectedCar.lock_status)}</Typography>
                            <Typography>电量: {selectedCar.electricity}% | 预计里程: {selectedCar.mileage}km</Typography>
                        </Box>
                        <Compass carPosition={{ latitude: selectedCar.latitude, longitude: selectedCar.longitude }} />
                    </CardContent>
                    <CardActions sx={{ justifyContent: 'space-between' }}>
                        <Box>
                            <Button onClick={() => handleOrderCar(selectedCar.number)}>预约</Button>
                            <Button onClick={() => handleReserveCar(selectedCar.number)}>保留车位</Button>
                            <Button onClick={() => setSelectedCar(null)}>关闭</Button>
                        </Box>
                        <Button startIcon={<AddIcon />} onClick={() => {
                            setNewPlace({ name: '', lat: selectedCar.latitude, lon: selectedCar.longitude });
                            setDialogOpen(true);
                        }}>
                            收藏位置
                        </Button>
                    </CardActions>
                </Card>
            )}
            <Card>
                <CardContent>
                    <Typography variant="h6">附近车辆 ({sortedAndFilteredCars.length})</Typography>
                    <Box sx={{ display: 'flex', gap: 1, my: 1 }}>
                        {['all', 1, 2].map(type => <Chip key={type} label={{ all: '全部', 1: '单车', 2: '电单车' }[type]} onClick={() => setCarTypeFilter(type)} variant={carTypeFilter === type ? 'filled' : 'outlined'} />)}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, my: 1 }}>
                        {['distance', 'electricity', 'mileage'].map(c => <Chip key={c} label={{ distance: '距离', electricity: '电量', mileage: '续航' }[c]} onClick={() => setSortCriteria(c)} variant={sortCriteria === c ? 'filled' : 'outlined'} />)}
                    </Box>
                    {loading && surroundingCars.length === 0 && <Box sx={{ display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}
                    <List>{sortedAndFilteredCars.map(c => <ListItem button key={c.number} onClick={() => handleSelectCar(c.number)}><ListItemText primary={`${c.number} (${c.carmodel_id === 1 ? '单车' : '电单车'})`} secondary={c.detailsFetched ? `电量: ${c.electricity}% | 续航: ${c.mileage}km` : '点击加载详情...'} /><Typography>{(c.distance * 1000).toFixed(0)}m</Typography></ListItem>)}</List>
                </CardContent>
            </Card>
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogTitle>添加常用地点</DialogTitle>
                <DialogContent>
                    <TextField autoFocus margin="dense" label="名称" fullWidth value={newPlace.name} onChange={e => setNewPlace(p => ({ ...p, name: e.target.value }))} />
                    <TextField margin="dense" label="纬度" fullWidth value={newPlace.lat} onChange={e => setNewPlace(p => ({ ...p, lat: e.target.value }))} />
                    <TextField margin="dense" label="经度" fullWidth value={newPlace.lon} onChange={e => setNewPlace(p => ({ ...p, lon: e.target.value }))} />
                </DialogContent>
                <DialogActions><Button onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={handleAddPlace}>添加</Button></DialogActions>
            </Dialog>
            <Dialog open={promptDialog.open} onClose={() => setPromptDialog(p => ({ ...p, open: false }))}>
                <DialogTitle>{promptDialog.title}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label={promptDialog.label}
                        fullWidth
                        multiline={promptDialog.multiline}
                        rows={promptDialog.multiline ? 4 : 1}
                        onChange={e => setPromptDialog(p => ({ ...p, value: e.target.value }))}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPromptDialog(p => ({ ...p, open: false }))}>取消</Button>
                    <Button onClick={() => {
                        promptDialog.onConfirm(promptDialog.value);
                        setPromptDialog(p => ({ ...p, open: false, value: '' }));
                    }}>确认</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

function ProfilePage({ user, onLogout, showSnackbar }) {
    const [token, setToken] = useState(localStorage.getItem('authToken') || '');
    const [tokenExp, setTokenExp] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newToken, setNewToken] = useState('');
    const [unpaidOrder, setUnpaidOrder] = useState(null);
    const [isPaying, setIsPaying] = useState(false);

    const fetchUnpaidOrder = useCallback(async () => {
        try {
            const order = await apiCall('/orders/unpaid');
            setUnpaidOrder(order);
        } catch (error) {
            // 404 is expected, so we check for the specific message from our API
            if (error.message.includes('No unpaid order found')) {
                setUnpaidOrder(null);
            } else {
                showSnackbar(`获取未支付订单失败: ${error.message}`, 'error');
            }
        }
    }, [showSnackbar]);

    useEffect(() => {
        if (token) {
            const decoded = parseJwt(token);
            setTokenExp(decoded ? new Date(decoded.exp * 1000).toLocaleString() : '无法解析');
        }
        fetchUnpaidOrder();
    }, [token, fetchUnpaidOrder]);

    const handlePayUnpaid = async () => {
        setIsPaying(true);
        try {
            const res = await apiCall('/orders/pay_unpaid', 'POST');
            showSnackbar(res.message, 'success');
            fetchUnpaidOrder(); // Refresh order status
            // We might need a way to refresh user balance here if it's not automatic
        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally {
            setIsPaying(false);
        }
    };

    const handleExport = () => navigator.clipboard.writeText(token).then(() => showSnackbar('已复制', 'success'));
    const handleImport = () => {
        localStorage.setItem('authToken', newToken);
        window.location.reload();
    };

    return (
        <Container sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Card>
                <CardContent>
                    <Typography variant="h6">我的信息</Typography>
                    <List>
                        <ListItem><ListItemText primary="昵称" secondary={user?.nickname} /></ListItem>
                        <ListItem><ListItemText primary="手机号" secondary={user?.phone} /></ListItem>
                        <ListItem>
                            <ListItemText primary="余额" secondary={`${user?.balance} 元`} />
                            <Button 
                                variant="contained" 
                                size="small"
                                disabled={!unpaidOrder || isPaying}
                                onClick={handlePayUnpaid}
                                sx={{ ml: 2 }}
                            >
                                {isPaying ? <CircularProgress size={24} /> : '支付未付订单'}
                            </Button>
                        </ListItem>
                    </List>
                </CardContent>
            </Card>
            <Card>
                <CardContent>
                    <Typography variant="h6">Token 管理</Typography>
                    <Typography variant="body2">有效期: {tokenExp}</Typography>
                </CardContent>
                <CardActions>
                    <Button onClick={handleExport}>导出</Button>
                    <Button onClick={() => setDialogOpen(true)}>导入</Button>
                </CardActions>
            </Card>
            <Button variant="contained" color="error" onClick={onLogout}>退出登录</Button>
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogTitle>导入 Token</DialogTitle>
                <DialogContent><TextField multiline rows={4} fullWidth value={newToken} onChange={e => setNewToken(e.target.value)} /></DialogContent>
                <DialogActions><Button onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={handleImport}>导入</Button></DialogActions>
            </Dialog>
        </Container>
    );
}

function MapPage({ showSnackbar, cyclingCarInfo }) {
    const mapRef = useRef(null);
    const [mapInstance, setMapInstance] = useState(null);
    const [favoritePlaces] = useLocalStorage('favoritePlaces', []);
    const [selectedLocation, setSelectedLocation] = useState('current');
    const { setPosition: setUserPosition } = useCurrentPosition();
    const [confirmDialog, setConfirmDialog] = useState({ open: false, lat: 0, lng: 0 });
    
    const userMarker = useRef(null);
    const carMarkers = useRef([]);
    const cyclingCarMarker = useRef(null);

    // Effect 1: Initialize the map. Runs only once.
    useEffect(() => {
        let destroyed = false;
        AMapLoader.load({
            key: "02b33ddfba9a866050d7e9ef5ca57e9d",
            version: "2.0",
            plugins: ['AMap.ToolBar', 'AMap.Scale'],
        }).then((AMap) => {
            if (destroyed || !mapRef.current) return;
            
            const map = new AMap.Map(mapRef.current, { zoom: 15 });
            map.addControl(new AMap.ToolBar());
            map.addControl(new AMap.Scale());

            map.on('click', (e) => {
                setConfirmDialog({ open: true, lat: e.lnglat.getLat(), lng: e.lnglat.getLng() });
            });
            
            const favMarkers = favoritePlaces.map(place => {
                const placeMarker = new AMap.Marker({
                    position: [parseFloat(place.lon), parseFloat(place.lat)],
                    content: `<div style="color: #9c27b0; transform: scale(1.5);"><svg t="1726730015083" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1475" width="24" height="24"><path d="M512 789.077333l-220.16 133.461334 60.586667-256.341334-199.125334-172.245333 262.144-22.528L512 234.666667l96.554667 236.768 262.144 22.528-199.125333 172.245333 60.586666 256.341334z" fill="currentColor" p-id="1476"></path></svg></div>`,
                    offset: new AMap.Pixel(-18, -36),
                    title: place.name,
                    zIndex: 110
                });
                const infoWindow = new AMap.InfoWindow({ content: `<b>${place.name}</b>`, offset: new AMap.Pixel(0, -30) });
                placeMarker.on('click', () => infoWindow.open(map, placeMarker.getPosition()));
                return placeMarker;
            });
            map.add(favMarkers);
            
            setMapInstance(map);

        }).catch(e => {
            console.error(e);
            showSnackbar('地图加载失败', 'error');
        });

        return () => {
            destroyed = true;
            if (mapInstance) {
                mapInstance.destroy();
            }
        };
    }, []); // Empty dependency array ensures it runs only once.

    // Effect 2: Draw/update the cycling car marker.
    useEffect(() => {
        if (!mapInstance) return;

        if (cyclingCarInfo) {
            const position = [cyclingCarInfo.longitude, cyclingCarInfo.latitude];
            const isBike = cyclingCarInfo.carmodel_id === 1;
            const innerIcon = isBike
                ? `<svg t="1726730133434" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4504" width="20" height="20"><path d="M789.333333 810.666667c-46.933333 0-85.333333-38.4-85.333333-85.333334s38.4-85.333333 85.333333-85.333333 85.333333 38.4 85.333333 85.333333-38.4 85.333334-85.333333 85.333334z m0-128c-23.466667 0-42.666667 19.2-42.666667 42.666666s19.2 42.666667 42.666667 42.666667 42.666667-19.2 42.666667-42.666667-19.2-42.666667-42.666667-42.666666zM234.666667 810.666667c-46.933333 0-85.333333-38.4-85.333334-85.333334s38.4-85.333333 85.333334-85.333333 85.333333 38.4 85.333333 85.333333-38.4 85.333334-85.333333 85.333334z m0-128c-23.466667 0-42.666667 19.2-42.666667 42.666666s19.2 42.666667 42.666667 42.666667 42.666667-19.2 42.666667-42.666667-19.2-42.666667-42.666667-42.666666zM490.666667 554.666667l-128-256-85.333334 42.666666L362.666667 512l-170.666667 0.042667-42.666667-85.333334h-85.333333v85.333334h42.666667l42.666666 85.333333h213.333334l-42.666667 85.333333h-128v85.333334h128c35.2 0 64-28.8 64-64l42.666667-85.333334 1.450666-3.029333 126.549334 126.592 60.330666-60.330667-126.592-126.549333zM448 298.666667c-46.933333 0-85.333333-38.4-85.333333-85.333334s38.4-85.333333 85.333333-85.333333 85.333333 38.4 85.333333 85.333333-38.4 85.333334-85.333333 85.333334z m0-128c-23.466667 0-42.666667 19.2-42.666667 42.666666s19.2 42.666667 42.666667 42.666667 42.666667-19.2 42.666667-42.666667-19.2-42.666667-42.666667-42.666666z" fill="#FFFFFF" p-id="4505"></path></svg>`
                : `<svg t="1726730185138" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5699" width="20" height="20"><path d="M426.666667 85.333333l-42.666667 469.333334h213.333333l-42.666666 213.333333 256-384-170.666667-42.666667 42.666667-256z" fill="#FFFFFF" p-id="5700"></path></svg>`;
            const cyclingIconContent = `<div style="width: 32px; height: 32px; background-color: #4caf50; border-radius: 50%; display: flex; justify-content: center; align-items: center; border: 3px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.4); transform: scale(1.2);">${innerIcon}</div>`;

            if (cyclingCarMarker.current) {
                cyclingCarMarker.current.setPosition(position);
                cyclingCarMarker.current.setContent(cyclingIconContent);
            } else {
                cyclingCarMarker.current = new AMap.Marker({ position, content: cyclingIconContent, offset: new AMap.Pixel(-19, -38), title: `当前用车: ${cyclingCarInfo.number}`, zIndex: 150 });
                mapInstance.add(cyclingCarMarker.current);
            }
        } else if (cyclingCarMarker.current) {
            mapInstance.remove(cyclingCarMarker.current);
            cyclingCarMarker.current = null;
        }
    }, [cyclingCarInfo, mapInstance]);

    // Effect 3: Pan map and fetch surrounding cars when location changes.
    useEffect(() => {
        if (!mapInstance) return;

        const panAndFetch = async () => {
            let targetCoords;
            if (selectedLocation === 'current') {
                try {
                    const pos = await getCurrentPositionWithOffset();
                    targetCoords = pos.coords;
                } catch (err) {
                    showSnackbar(`定位失败: ${err.message}`, 'error');
                    return;
                }
            } else {
                const place = favoritePlaces.find(p => p.name === selectedLocation);
                if (place) {
                    targetCoords = { latitude: parseFloat(place.lat), longitude: parseFloat(place.lon) };
                }
            }

            if (targetCoords) {
                const position = [targetCoords.longitude, targetCoords.latitude];
                mapInstance.setCenter(position);

                if (userMarker.current) {
                    userMarker.current.setPosition(position);
                } else {
                    userMarker.current = new AMap.Marker({ position, content: `<div style="background-color: #1976d2; width: 24px; height: 24px; border-radius: 50%; display: flex; justify-content: center; align-items: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><div style="width: 12px; height: 12px; background-color: white; border-radius: 50%;"></div></div>`, offset: new AMap.Pixel(-14, -28), title: '我的位置', zIndex: 120 });
                    mapInstance.add(userMarker.current);
                }

                if (carMarkers.current.length > 0) mapInstance.remove(carMarkers.current);
                carMarkers.current = [];

                try {
                    const cars = await apiCall(`/cars/surrounding?latitude=${targetCoords.latitude}&longitude=${targetCoords.longitude}`);
                    const newMarkers = cars
                        .filter(car => !cyclingCarInfo || car.number !== cyclingCarInfo.number)
                        .map(car => {
                            const isBike = car.carmodel_id === 1;
                            const color = isBike ? '#2e7d32' : '#d32f2f';
                            const svgIcon = isBike ? `<svg t="1726730133434" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4504" width="24" height="24"><path d="M789.333333 810.666667c-46.933333 0-85.333333-38.4-85.333333-85.333334s38.4-85.333333 85.333333-85.333333 85.333333 38.4 85.333333 85.333333-38.4 85.333334-85.333333 85.333334z m0-128c-23.466667 0-42.666667 19.2-42.666667 42.666666s19.2 42.666667 42.666667 42.666667 42.666667-19.2 42.666667-42.666667-19.2-42.666667-42.666667-42.666666zM234.666667 810.666667c-46.933333 0-85.333333-38.4-85.333334-85.333334s38.4-85.333333 85.333334-85.333333 85.333333 38.4 85.333333 85.333333-38.4 85.333334-85.333333 85.333334z m0-128c-23.466667 0-42.666667 19.2-42.666667 42.666666s19.2 42.666667 42.666667 42.666667 42.666667-19.2 42.666667-42.666667-19.2-42.666667-42.666667-42.666666zM490.666667 554.666667l-128-256-85.333334 42.666666L362.666667 512l-170.666667 0.042667-42.666667-85.333334h-85.333333v85.333334h42.666667l42.666666 85.333333h213.333334l-42.666667 85.333333h-128v85.333334h128c35.2 0 64-28.8 64-64l42.666667-85.333334 1.450666-3.029333 126.549334 126.592 60.330666-60.330667-126.592-126.549333zM448 298.666667c-46.933333 0-85.333333-38.4-85.333333-85.333334s38.4-85.333333 85.333333-85.333333 85.333333 38.4 85.333333 85.333333-38.4 85.333334-85.333333 85.333334z m0-128c-23.466667 0-42.666667 19.2-42.666667 42.666666s19.2 42.666667 42.666667 42.666667 42.666667-19.2 42.666667-42.666667-19.2-42.666667-42.666667-42.666666z" fill="${color}" p-id="4505"></path></svg>` : `<svg t="1726730185138" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5699" width="24" height="24"><path d="M426.666667 85.333333l-42.666667 469.333334h213.333333l-42.666666 213.333333 256-384-170.666667-42.666667 42.666667-256z" fill="${color}" p-id="5700"></path></svg>`;
                            const marker = new AMap.Marker({ position: [car.longitude, car.latitude], content: `<div style="transform: scale(1.5); filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.5));">${svgIcon}</div>`, offset: new AMap.Pixel(-18, -36), title: `车辆编号: ${car.number}`, zIndex: isBike ? 100 : 105 });
                            marker.on('click', async () => {
                                try {
                                    const carDetails = await apiCall(`/cars/${car.number}`);
                                    const infoWindow = new AMap.InfoWindow({ content: `<div><b>车辆详情</b></div><div>编号: ${carDetails.number}</div><div>型号: ${carDetails.carmodel_name}</div><div>电量: ${carDetails.electricity}%</div><div>续航: ${carDetails.mileage}km</div>`, offset: new AMap.Pixel(0, -30) });
                                    infoWindow.open(mapInstance, marker.getPosition());
                                } catch (err) { showSnackbar(`获取车辆详情失败: ${err.message}`, 'error'); }
                            });
                            return marker;
                        });
                    mapInstance.add(newMarkers);
                    carMarkers.current = newMarkers;
                } catch (err) {
                    showSnackbar(`查找附近车辆失败: ${err.message}`, 'error');
                }
            }
        };
        panAndFetch();
    }, [selectedLocation, cyclingCarInfo, mapInstance]);

    return (
        <Box sx={{ position: 'relative', width: '100%', height: 'calc(100vh - 124px)' }}>
            <FormControl sx={{ position: 'absolute', top: 16, left: 16, zIndex: 10, minWidth: 120, backgroundColor: 'white' }}>
                <InputLabel>位置</InputLabel>
                <Select value={selectedLocation} label="位置" onChange={(e) => setSelectedLocation(e.target.value)} size="small">
                    <MenuItem value="current">当前位置</MenuItem>
                    {favoritePlaces.map(p => <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>)}
                </Select>
            </FormControl>
            <Box ref={mapRef} sx={{ width: '100%', height: '100%' }} />
            <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog(p => ({ ...p, open: false }))}>
                <DialogTitle>确认新位置</DialogTitle>
                <DialogContent><Typography>要将此地点设置为您的当前位置吗？</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDialog(p => ({ ...p, open: false }))}>取消</Button>
                    <Button onClick={() => {
                        const newPosition = { latitude: confirmDialog.lat, longitude: confirmDialog.lng };
                        setUserPosition(newPosition);
                        if (userMarker.current) {
                            const amapPosition = new AMap.LngLat(newPosition.longitude, newPosition.latitude);
                            userMarker.current.setPosition(amapPosition);
                            mapInstance.setCenter(amapPosition);
                        }
                        setConfirmDialog({ open: false, lat: 0, lng: 0 });
                        showSnackbar('位置已更新', 'success');
                    }}>确认</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}


function TasksPage({ showSnackbar }) {
    const [tabValue, setTabValue] = useState(0);

    return (
        <Container sx={{ mt: 2 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} centered>
                    <Tab label="运行中任务" />
                    <Tab label="周期任务" />
                </Tabs>
            </Box>
            {tabValue === 0 && <RunningTasksTab showSnackbar={showSnackbar} />}
            {tabValue === 1 && <PeriodicTasksTab showSnackbar={showSnackbar} />}
        </Container>
    );
}

function RunningTasksTab({ showSnackbar }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchTasks = useCallback(async () => {
        // setLoading(true) only on initial load
        try {
            const tasksData = await apiCall('/tasks');
            setTasks(tasksData);
        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showSnackbar]);

    const handleStopTask = async (carNumber) => {
        try {
            const res = await apiCall(`/tasks/${carNumber}`, 'DELETE');
            showSnackbar(res.message, 'success');
            // Optimistically remove the task or wait for the next fetch
            setTasks(prevTasks => prevTasks.filter(t => t.car_number !== carNumber));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchTasks();
        const interval = setInterval(fetchTasks, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [fetchTasks]);

    if (loading && tasks.length === 0) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'running':
            case 'pending':
                return 'primary.main';
            case 'completed':
                return 'success.main';
            case 'failed':
            case 'stopped':
                return 'error.main';
            default:
                return 'text.secondary';
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {loading && tasks.length === 0 ? (
                 <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
            ) : tasks.length === 0 ? (
                <Typography sx={{ textAlign: 'center', mt: 4 }}>当前没有后台任务</Typography>
            ) : (
                tasks.map((task, index) => (
                    <Card key={index} sx={{ borderLeft: `5px solid ${getStatusColor(task.status)}` }}>
                        <CardContent>
                            <Typography variant="h6">车辆: {task.car_number}</Typography>
                            <Typography>状态: <Typography component="span" sx={{ color: getStatusColor(task.status), fontWeight: 'bold' }}>{task.status}</Typography></Typography>
                            <Typography>进度: {task.current_loop}/{task.max_loops}</Typography>
                            <Typography variant="body2" sx={{ mt: 1 }}>信息: {task.message}</Typography>
                        </CardContent>
                        {(task.status === 'running' || task.status === 'pending') && (
                            <CardActions>
                                <Button size="small" color="error" onClick={() => handleStopTask(task.car_number)}>中止</Button>
                            </CardActions>
                        )}
                    </Card>
                ))
            )}
        </Box>
    );
}

function PeriodicTasksTab({ showSnackbar }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentTask, setCurrentTask] = useState(null);
    const [favoritePlaces] = useLocalStorage('favoritePlaces', []);
    const [selectedPlace, setSelectedPlace] = useState('');
    const [taskData, setTaskData] = useState({
        name: '',
        cron: '0 8 * * *',
        min_electricity: 80,
        max_loops: 10,
        carmodel_id: null,
    });

    const fetchPeriodicTasks = useCallback(async () => {
        try {
            const data = await apiCall('/periodic');
            setTasks(data);
        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showSnackbar]);

    useEffect(() => {
        setLoading(true);
        fetchPeriodicTasks();
    }, [fetchPeriodicTasks]);

    const handleDelete = async (taskId) => {
        try {
            await apiCall(`/periodic/${taskId}`, 'DELETE');
            showSnackbar('任务已删除', 'success');
            fetchPeriodicTasks();
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };

    const handleCreateOrUpdate = async () => {
        const place = favoritePlaces.find(p => p.name === selectedPlace);
        if (!place) {
            showSnackbar('请选择一个常用地点', 'error');
            return;
        }

        try {
            const payload = {
                ...taskData,
                latitude: parseFloat(place.lat),
                longitude: parseFloat(place.lon),
                location_name: place.name,
                min_electricity: parseInt(taskData.min_electricity, 10),
                max_loops: parseInt(taskData.max_loops, 10),
                carmodel_id: taskData.carmodel_id ? parseInt(taskData.carmodel_id, 10) : null,
            };

            if (isEditing) {
                await apiCall(`/periodic/${currentTask.id}`, 'PUT', payload);
                showSnackbar('周期任务更新成功', 'success');
            } else {
                await apiCall('/periodic', 'POST', payload);
                showSnackbar('周期任务创建成功', 'success');
            }
            
            setDialogOpen(false);
            fetchPeriodicTasks();
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
    
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setTaskData(prev => ({ ...prev, [name]: value }));
    };

    const openCreateDialog = () => {
        setIsEditing(false);
        setCurrentTask(null);
        setTaskData({ name: '', cron: '0 8 * * *', min_electricity: 80, max_loops: 10, carmodel_id: null });
        setSelectedPlace('');
        setDialogOpen(true);
    };

    const openEditDialog = (task) => {
        setIsEditing(true);
        setCurrentTask(task);
        const placeName = task.location_name || favoritePlaces.find(p => p.lat == task.latitude && p.lon == task.longitude)?.name;
        setSelectedPlace(placeName || '');
        setTaskData({
            name: task.name,
            cron: task.cron,
            min_electricity: task.min_electricity,
            max_loops: task.max_loops,
            carmodel_id: task.carmodel_id,
        });
        setDialogOpen(true);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
                    创建新任务
                </Button>
            </Box>
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
            ) : tasks.length === 0 ? (
                <Typography sx={{ textAlign: 'center', mt: 4 }}>没有周期性任务</Typography>
            ) : (
                tasks.map(task => (
                    <Card key={task.id}>
                        <CardContent>
                            <Typography variant="h6">{task.name}</Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>Cron: {task.cron}</Typography>
                            <Typography variant="body2">位置: {task.location_name || `${task.latitude}, ${task.longitude}`}</Typography>
                            <Typography variant="body2">要求: {task.carmodel_id ? (task.carmodel_id === 1 ? '单车' : '电单车') : '任何类型'} | 电量 {'>='} {task.min_electricity}%</Typography>
                            {task.last_run_time && (
                                <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                                    <Typography variant="caption">
                                        上次运行: {new Date(task.last_run_time).toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" display="block" sx={{ color: task.last_run_status.startsWith('Success') ? 'success.main' : 'error.main' }}>
                                        状态: {task.last_run_status}
                                    </Typography>
                                </Box>
                            )}
                        </CardContent>
                        <CardActions>
                            <Button size="small" onClick={() => openEditDialog(task)}>编辑</Button>
                            <IconButton onClick={() => handleDelete(task.id)}><DeleteIcon /></IconButton>
                        </CardActions>
                    </Card>
                ))
            )}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogTitle>{isEditing ? '编辑周期任务' : '创建新的周期任务'}</DialogTitle>
                <DialogContent>
                    <TextField name="name" label="任务名称" value={taskData.name} onChange={handleInputChange} fullWidth margin="dense" />
                    <TextField name="cron" label="Cron 表达式" value={taskData.cron} onChange={handleInputChange} fullWidth margin="dense" helperText="分 时 日 月 周" />
                    <FormControl fullWidth margin="dense">
                        <InputLabel>地点</InputLabel>
                        <Select value={selectedPlace} label="地点" onChange={(e) => setSelectedPlace(e.target.value)}>
                            {favoritePlaces.map(p => <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                     <FormControl fullWidth margin="dense">
                        <InputLabel>车辆类型</InputLabel>
                        <Select name="carmodel_id" value={taskData.carmodel_id || ''} label="车辆类型" onChange={handleInputChange}>
                            <MenuItem value={null}>任何类型</MenuItem>
                            <MenuItem value={1}>单车</MenuItem>
                            <MenuItem value={2}>电单车</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField name="min_electricity" label="最低电量 (%)" value={taskData.min_electricity} onChange={handleInputChange} fullWidth margin="dense" type="number" />
                    <TextField name="max_loops" label="最大循环次数" value={taskData.max_loops} onChange={handleInputChange} fullWidth margin="dense" type="number" />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>取消</Button>
                    <Button onClick={handleCreateOrUpdate}>{isEditing ? '保存' : '创建'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}


function App() {
    const [token, setToken] = useState(localStorage.getItem('authToken'));
    const [user, setUser] = useState(null);
    const [currentOrder, setCurrentOrder] = useState(null);
    const [cyclingCarInfo, setCyclingCarInfo] = useState(null);
    const [activePage, setActivePage] = useState('home');
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

    const fetchInitialData = useCallback(async () => {
        if (!token) { setLoading(false); return; }
        setLoading(true);
        try {
            const userData = await apiCall('/user');
            if (userData.error === 'unauthorized') {
                setAuthError(true);
                setLoading(false);
                return;
            }
            setUser(userData);
            const orderData = await apiCall('/orders/current').catch(() => null);
            setCurrentOrder(orderData);
            if (orderData?.car_number) {
                const carData = await apiCall(`/cars/${orderData.car_number}`);
                if (carData.error === 'unauthorized') {
                    setAuthError(true);
                } else {
                    setCyclingCarInfo(carData);
                }
            } else {
                setCyclingCarInfo(null);
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

    const handleLoginSuccess = (newToken) => {
        localStorage.setItem('authToken', newToken);
        setToken(newToken);
    };
    const handleLogout = () => {
        localStorage.removeItem('authToken');
        setToken(null); setUser(null); setCurrentOrder(null); setCyclingCarInfo(null);
    };
    const handleCyclingAction = async (action) => {
        try {
            const res = await apiCall(`/orders/actions/${action}`, 'POST');
            showSnackbar((res ? res.message : '指令已发送') + " 页面即将刷新。", 'success');
            setTimeout(fetchInitialData, 2000);
        } catch (err) { showSnackbar(err.message, 'error'); }
    };

    const showSnackbar = useCallback((message, severity = 'info') => {
        setSnackbar({ open: true, message, severity });
    }, []);
    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') return;
        setSnackbar(prev => ({ ...prev, open: false }));
    };

    if (!token) return <LoginPage onLoginSuccess={handleLoginSuccess} showSnackbar={showSnackbar} />;
    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;

    const renderPage = () => {
        switch (activePage) {
            case 'home':
                return <HomePage user={user} onRefresh={fetchInitialData} setCurrentOrder={setCurrentOrder} setCyclingCarInfo={setCyclingCarInfo} showSnackbar={showSnackbar} />;
            case 'map':
                return <MapPage showSnackbar={showSnackbar} cyclingCarInfo={cyclingCarInfo} />;
            case 'tasks':
                return <TasksPage showSnackbar={showSnackbar} />;
            case 'profile':
                return <ProfilePage user={user} onLogout={handleLogout} showSnackbar={showSnackbar} />;
            default:
                return null;
        }
    };
    
    const pageTitles = { home: '主页', map: '地图', tasks: '后台任务', profile: '我的' };

    return (
        <Box sx={{ pb: 7, pt: currentOrder ? '140px' : '70px' }}>
            <AppBar position="fixed"><Toolbar><Typography variant="h6">{pageTitles[activePage]}</Typography></Toolbar></AppBar>
            {currentOrder && <CyclingBanner order={currentOrder} carInfo={cyclingCarInfo} onAction={handleCyclingAction} />}
            {renderPage()}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
            <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={3}>
                <BottomNavigation showLabels value={activePage} onChange={(e, v) => setActivePage(v)}>
                    <BottomNavigationAction label="主页" value="home" icon={<HomeIcon />} />
                    <BottomNavigationAction label="地图" value="map" icon={<MapIcon />} />
                    <BottomNavigationAction label="任务" value="tasks" icon={<DnsIcon />} />
                    <BottomNavigationAction label="我的" value="profile" icon={<PersonIcon />} />
                </BottomNavigation>
            </Paper>
            <Dialog open={authError} onClose={() => setAuthError(false)}>
                <DialogTitle>认证失败</DialogTitle>
                <DialogContent>
                    <Typography>您的登录凭证 (Token) 可能已失效，请重新登录。</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAuthError(false)}>关闭</Button>
                    <Button onClick={handleLogout} variant="contained">重新登录</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

const theme = createTheme({ palette: { mode: 'light' } });
const root = createRoot(document.getElementById('root'));
root.render(<ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>);
