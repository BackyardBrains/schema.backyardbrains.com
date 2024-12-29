#written by Stanislav Mircic 13. Sep. 2023
# Backyard Brains 

from PIL import Image
import os
import json

# Specify the directory path where your JSON files are located
directory_path = '../../uploads'

# List all files in the directory
json_files = [f for f in os.listdir(directory_path) if f.endswith('.json')]

# Loop through each JSON file
for json_file in json_files:
    file_path = os.path.join(directory_path, json_file)

    # Check if the file exists and is a regular file
    if os.path.isfile(file_path):
        with open(file_path, 'r') as file:
            try:
                # Parse the JSON content
                json_data = json.load(file)
                trials = gaze_data = json_data['data']['trials']
                for trial in trials:
                            
                        gaze_data = trial['gazeData']
                        image_name = trial['image']['imageName']
                        image_width = trial['image']['width']
                        image_height = trial['image']['height']
                        screen_width = trial['layout']['visibleImageSize']["width"]
                        screen_height = trial['layout']['visibleImageSize']["height"]

                        # Open the image
                        image_path = "img/"+image_name  # Replace with the path to your image
                        image = Image.open(image_path)

                        # Get the image's pixel data
                        pixels = image.load()

                        scale = screen_width/image_width
                        offset = 0.5*(image_height*scale-screen_height)

                        # Print the gaze data
                        for point in gaze_data:
                            
                            x = int((1/scale)* point['x'])
                            y = int((1/scale)*(offset+point['y']))
                            if(x>0 and x<(image_width-1) and y>0 and y<(image_height-1)):
                                pixels[x-1, y-1] = (255, 0, 0)
                                pixels[x+1, y-1] = (255, 0, 0)
                                pixels[x, y-1] = (255, 0, 0)
                                pixels[x-1, y] = (255, 0, 0)
                                pixels[x+1, y] = (255, 0, 0)
                                pixels[x, y] = (255, 0, 0)
                                pixels[x-1, y+1] = (255, 0, 0)
                                pixels[x+1, y+1] = (255, 0, 0)
                                pixels[x, y+1] = (255, 0, 0)

                        # Save the modified image
                        # Remove the file extension
                        output_path = image_name.rsplit('.', 1)[0]
                        output_path = "out_"+output_path+".png" # Replace with the desired output path
                        image.save(output_path)

                        # Close the image
                        image.close()


            except json.JSONDecodeError as e:
                print(f"Error parsing {json_file}: {str(e)}")

    




print("done")