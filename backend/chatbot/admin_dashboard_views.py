from django.http import HttpResponse, FileResponse
from django.shortcuts import render
import os
from django.conf import settings

def admin_dashboard(request, filename='index.html'):
    """Serve admin dashboard HTML files"""
    # Get the path to admin_dashboard folder
    admin_dashboard_path = os.path.join(settings.BASE_DIR.parent, 'admin_dashboard')
    file_path = os.path.join(admin_dashboard_path, filename)
    
    # Security check - only allow HTML, CSS, JS files
    allowed_extensions = ['.html', '.css', '.js', '.jpg', '.png', '.ico']
    if not any(file_path.endswith(ext) for ext in allowed_extensions):
        return HttpResponse('File type not allowed', status=403)
    
    # Check if file exists
    if not os.path.exists(file_path):
        return HttpResponse('File not found', status=404)
    
    # Serve the file
    if filename.endswith('.html'):
        return FileResponse(open(file_path, 'rb'), content_type='text/html')
    elif filename.endswith('.css'):
        return FileResponse(open(file_path, 'rb'), content_type='text/css')
    elif filename.endswith('.js'):
        return FileResponse(open(file_path, 'rb'), content_type='application/javascript')
    else:
        return FileResponse(open(file_path, 'rb'))

