# PowerShell script for Docker development workflow

param(
    [string]$Command = "help",
    [switch]$Rebuild,
    [switch]$Logs,
    [switch]$Clean
)

Write-Host "🐳 Clutch Hub API Docker Development" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

function Show-Help {
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor White
    Write-Host "  build    - Build the Docker image" -ForegroundColor Gray
    Write-Host "  up       - Start the services" -ForegroundColor Gray
    Write-Host "  down     - Stop the services" -ForegroundColor Gray
    Write-Host "  logs     - Show service logs" -ForegroundColor Gray
    Write-Host "  restart  - Restart the services" -ForegroundColor Gray
    Write-Host "  clean    - Clean up containers and images" -ForegroundColor Gray
    Write-Host "  shell    - Access container shell" -ForegroundColor Gray
    Write-Host "  health   - Check service health" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Flags:" -ForegroundColor White
    Write-Host "  -Rebuild - Force rebuild of images" -ForegroundColor Gray
    Write-Host "  -Logs    - Follow logs after starting" -ForegroundColor Gray
    Write-Host "  -Clean   - Clean up before building" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor White
    Write-Host "  .\scripts\docker-dev.ps1 build -Rebuild" -ForegroundColor Gray
    Write-Host "  .\scripts\docker-dev.ps1 up -Logs" -ForegroundColor Gray
}

function Build-Image {
    Write-Host "🔨 Building Docker image..." -ForegroundColor Yellow
    
    if ($Clean) {
        Write-Host "🧹 Cleaning up old containers and images..." -ForegroundColor Yellow
        docker-compose down --rmi all --volumes --remove-orphans
    }
    
    $buildArgs = @("build")
    if ($Rebuild) {
        $buildArgs += "--no-cache"
    }
    
    docker-compose $buildArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Build completed successfully!" -ForegroundColor Green
    } else {
        Write-Error "❌ Build failed!"
        exit 1
    }
}

function Start-Services {
    Write-Host "🚀 Starting services..." -ForegroundColor Yellow
    
    docker-compose up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Services started successfully!" -ForegroundColor Green
        Write-Host "🔗 API available at: http://localhost:3000" -ForegroundColor Cyan
        Write-Host "📊 Health check: http://localhost:3000/health" -ForegroundColor Cyan
        
        if ($Logs) {
            Show-Logs
        }
    } else {
        Write-Error "❌ Failed to start services!"
        exit 1
    }
}

function Stop-Services {
    Write-Host "🛑 Stopping services..." -ForegroundColor Yellow
    docker-compose down
    Write-Host "✅ Services stopped!" -ForegroundColor Green
}

function Show-Logs {
    Write-Host "📋 Showing logs (Ctrl+C to exit)..." -ForegroundColor Yellow
    docker-compose logs -f clutch-hub-api
}

function Restart-Services {
    Write-Host "🔄 Restarting services..." -ForegroundColor Yellow
    docker-compose restart
    Write-Host "✅ Services restarted!" -ForegroundColor Green
}

function Clean-Up {
    Write-Host "🧹 Cleaning up Docker resources..." -ForegroundColor Yellow
    docker-compose down --rmi all --volumes --remove-orphans
    docker system prune -f
    Write-Host "✅ Cleanup completed!" -ForegroundColor Green
}

function Access-Shell {
    Write-Host "🐚 Accessing container shell..." -ForegroundColor Yellow
    docker-compose exec clutch-hub-api /bin/sh
}

function Check-Health {
    Write-Host "🏥 Checking service health..." -ForegroundColor Yellow
    
    $response = try {
        Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 10
    } catch {
        Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
        return
    }
    
    Write-Host "✅ Service is healthy!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Gray
}

# Main command routing
switch ($Command.ToLower()) {
    "build" { Build-Image }
    "up" { Start-Services }
    "down" { Stop-Services }
    "logs" { Show-Logs }
    "restart" { Restart-Services }
    "clean" { Clean-Up }
    "shell" { Access-Shell }
    "health" { Check-Health }
    "help" { Show-Help }
    default { 
        Write-Host "❌ Unknown command: $Command" -ForegroundColor Red
        Show-Help
    }
}

