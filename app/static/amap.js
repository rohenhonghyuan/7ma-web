let amapInstance = null;

async function loadAMap() {
    if (amapInstance) {
        return amapInstance;
    }
    try {
        amapInstance = await AMapLoader.load({
            key: "02b33ddfba9a866050d7e9ef5ca57e9d",
            version: "2.0",
            plugins: ['AMap.Geolocation', 'AMap.ToolBar', 'AMap.Scale'],
        });
        return amapInstance;
    } catch (e) {
        console.error("Failed to load AMap SDK:", e);
        throw e;
    }
}

export async function getCurrentPosition() {
    const AMap = await loadAMap();
    return new Promise((resolve, reject) => {
        const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            zoomToAccuracy: true,
        });

        geolocation.getCurrentPosition((status, result) => {
            if (status === 'complete') {
                // Convert GCJ-02 to WGS-84
                AMap.convertFrom([result.position.lng, result.position.lat], 'gps', (status, res) => {
                    if (status === 'complete' && res.info === 'ok') {
                        resolve({
                            coords: {
                                latitude: res.locations[0].lat,
                                longitude: res.locations[0].lng,
                                accuracy: result.accuracy,
                            },
                            timestamp: result.timestamp,
                        });
                    } else {
                        reject(new Error('Coordinate conversion failed'));
                    }
                });
            } else {
                reject(new Error(result.message));
            }
        });
    });
}
