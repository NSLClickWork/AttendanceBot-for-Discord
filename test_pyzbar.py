import sys
from pyzbar.pyzbar import decode
from PIL import Image

def test():
    # create a dummy image
    img = Image.new('RGB', (100, 100), color = 'white')
    decoded = decode(img)
    print("Decoded dummy:", decoded)

test()
