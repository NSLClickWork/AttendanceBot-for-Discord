@echo off
setlocal EnableExtensions

set "PROJECT_DIR=C:\Users\nguye\Documents\Codex\2026-05-29\t-i-mu-n-t-o"
set "DOCKER_DESKTOP_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

title Attendance Discord Bot
echo ========================================================
echo              ATTENDANCE DISCORD BOT RUNNER
echo ========================================================
echo Project: %PROJECT_DIR%
echo.

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
  echo ERROR: Cannot open project directory.
  pause
  exit /b 1
)

if not exist ".env" (
  echo ERROR: .env file is missing. Create it before running the bot.
  pause
  exit /b 1
)

set "DB_PROVIDER=postgres"
for /f "tokens=1,* delims==" %%A in ('findstr /b /i "DB_PROVIDER=" ".env" 2^>nul') do set "DB_PROVIDER=%%B"
if "%DB_PROVIDER%"=="" set "DB_PROVIDER=postgres"
echo Database provider: %DB_PROVIDER%
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker CLI was not found. Install Docker Desktop first.
  pause
  exit /b 1
)

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo Docker is not running. Starting Docker Desktop...
if exist "%DOCKER_DESKTOP_EXE%" (
  start "" "%DOCKER_DESKTOP_EXE%"
)

set /a WAITED=0
:wait_docker
timeout /t 5 /nobreak >nul
set /a WAITED+=5
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
if %WAITED% GEQ 180 (
  echo ERROR: Docker did not become ready after 180 seconds.
  pause
  exit /b 1
)
echo Waiting for Docker... %WAITED%s
goto wait_docker

:docker_ready
echo Docker is ready.
echo.

if /I "%DB_PROVIDER%"=="sheets" (
  echo Starting Redis...
  docker compose up -d redis
) else (
  echo Starting Postgres and Redis...
  docker compose up -d postgres redis
)
if errorlevel 1 (
  echo ERROR: Failed to start Docker services.
  pause
  exit /b 1
)

if /I "%DB_PROVIDER%"=="sheets" goto skip_postgres_wait

echo Waiting for Postgres...
set /a WAITED=0
:wait_postgres
docker compose exec -T postgres pg_isready -U postgres -d it_attendance >nul 2>&1
if not errorlevel 1 goto postgres_ready
timeout /t 3 /nobreak >nul
set /a WAITED+=3
if %WAITED% GEQ 90 (
  echo ERROR: Postgres did not become ready after 90 seconds.
  docker compose logs postgres
  pause
  exit /b 1
)
goto wait_postgres

:postgres_ready
echo Postgres is ready.

:skip_postgres_wait
echo Waiting for Redis...
set /a WAITED=0
:wait_redis
docker compose exec -T redis redis-cli ping >nul 2>&1
if not errorlevel 1 goto redis_ready
timeout /t 3 /nobreak >nul
set /a WAITED+=3
if %WAITED% GEQ 90 (
  echo ERROR: Redis did not become ready after 90 seconds.
  docker compose logs redis
  pause
  exit /b 1
)
goto wait_redis

:redis_ready
echo Redis is ready.
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm was not found. Install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing Node dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Installing Python PDF dependencies...
python -m pip install reportlab pillow --quiet
if errorlevel 1 (
  echo WARNING: Python PDF dependencies failed to install. Bot will still start, but payslip PDF may fail.
)

echo Running database migrations...
call npm run db:migrate
if errorlevel 1 (
  echo ERROR: Database migration failed.
  pause
  exit /b 1
)

echo.
echo Starting Discord bot. Keep this window open.
echo Press Ctrl+C to stop the bot.
echo.
call npm run dev
set "BOT_EXIT_CODE=%ERRORLEVEL%"

echo.
echo Bot process stopped with exit code %BOT_EXIT_CODE%.
pause
exit /b %BOT_EXIT_CODE%
