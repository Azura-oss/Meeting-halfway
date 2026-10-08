import urllib.request
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
K = os.environ.get('TENCENT_MAP_KEY', '')

def t(url, label):
    try:
        d = json.load(urllib.request.urlopen(url, timeout=10))
        print(label, '->', d.get('status'), d.get('message'))
    except Exception as e:
        print(label, '-> ERR', e)

t('https://apis.map.qq.com/ws/place/v1/search?boundary=nearby(30.6107,103.9951,5000)&keyword=%E5%92%96%E5%95%A1%E5%8E%85&key=' + K, 'place_search')
t('https://apis.map.qq.com/ws/geocoder/v1/?location=30.6107,103.9951&key=' + K, 'geocoder')
t('https://apis.map.qq.com/ws/direction/v1/walking?from=30.6429,104.0431&to=30.6602,104.0815&key=' + K, 'walking')
t('https://apis.map.qq.com/ws/direction/v1/transit?from=30.5785,103.9471&to=30.6602,104.0815&key=' + K, 'transit')
