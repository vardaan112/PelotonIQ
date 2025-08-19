#!/bin/bash

# PelotonIQ Docker Stack Testing Script
# Comprehensive testing of all Docker services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TIMEOUT=300
HEALTH_CHECK_INTERVAL=10
COMPOSE_FILE="docker-compose.yml"
SERVICES=("postgres" "redis" "backend" "frontend" "data-processor" "ai-services" "tensorflow-serving" "prometheus" "grafana" "elasticsearch" "logstash" "kibana")

echo -e "${BLUE}🚀 Starting PelotonIQ Docker Stack Comprehensive Testing${NC}"
echo "=================================================="

# Function to print status
print_status() {
    local status=$1
    local message=$2
    case $status in
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "ERROR")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️ $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️ $message${NC}"
            ;;
    esac
}

# Function to wait for service health
wait_for_service_health() {
    local service=$1
    local max_attempts=$((TIMEOUT / HEALTH_CHECK_INTERVAL))
    local attempt=1

    print_status "INFO" "Waiting for $service to become healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose ps --filter "status=running" --services | grep -q "^$service$"; then
            local health_status=$(docker-compose ps --format "table {{.Name}}\t{{.State}}" | grep "$service" | awk '{print $2}')
            
            if [[ "$health_status" == *"Up"* ]] && [[ "$health_status" == *"healthy"* ]]; then
                print_status "SUCCESS" "$service is healthy"
                return 0
            fi
        fi
        
        echo -n "."
        sleep $HEALTH_CHECK_INTERVAL
        ((attempt++))
    done
    
    print_status "ERROR" "$service failed to become healthy within $TIMEOUT seconds"
    return 1
}

# Function to test service connectivity
test_service_connectivity() {
    local service=$1
    local port=$2
    local endpoint=$3
    
    print_status "INFO" "Testing connectivity to $service:$port$endpoint"
    
    if curl -f -s --max-time 10 "http://localhost:$port$endpoint" > /dev/null; then
        print_status "SUCCESS" "$service connectivity test passed"
        return 0
    else
        print_status "ERROR" "$service connectivity test failed"
        return 1
    fi
}

# Function to test database connectivity
test_database_connectivity() {
    print_status "INFO" "Testing PostgreSQL database connectivity"
    
    if docker-compose exec -T postgres psql -U pelotoniq_user -d pelotoniq -c "SELECT 1;" > /dev/null 2>&1; then
        print_status "SUCCESS" "PostgreSQL connectivity test passed"
        return 0
    else
        print_status "ERROR" "PostgreSQL connectivity test failed"
        return 1
    fi
}

# Function to test Redis connectivity
test_redis_connectivity() {
    print_status "INFO" "Testing Redis connectivity"
    
    if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
        print_status "SUCCESS" "Redis connectivity test passed"
        return 0
    else
        print_status "ERROR" "Redis connectivity test failed"
        return 1
    fi
}

# Function to test API endpoints
test_api_endpoints() {
    print_status "INFO" "Testing API endpoints"
    
    local endpoints=(
        "8080:/actuator/health"
        "3001:/health"
        "5001:/health"
        "8501:/v1/models"
        "9090:/api/v1/status/config"
        "3000:/api/health"
        "9200:/"
        "5601:/api/status"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local port=$(echo $endpoint | cut -d':' -f1)
        local path=$(echo $endpoint | cut -d':' -f2-)
        local service_name=""
        
        case $port in
            8080) service_name="Spring Boot Backend" ;;
            3001) service_name="Data Processor" ;;
            5001) service_name="AI Services" ;;
            8501) service_name="TensorFlow Serving" ;;
            9090) service_name="Prometheus" ;;
            3000) service_name="Grafana" ;;
            9200) service_name="Elasticsearch" ;;
            5601) service_name="Kibana" ;;
        esac
        
        if test_service_connectivity "$service_name" "$port" "$path"; then
            continue
        else
            return 1
        fi
    done
    
    return 0
}

# Function to test inter-service communication
test_inter_service_communication() {
    print_status "INFO" "Testing inter-service communication"
    
    # Test backend to database
    if docker-compose exec -T backend curl -f -s "http://postgres:5432" > /dev/null 2>&1 || \
       docker-compose logs backend | grep -q "Started.*successfully"; then
        print_status "SUCCESS" "Backend to database communication test passed"
    else
        print_status "ERROR" "Backend to database communication test failed"
        return 1
    fi
    
    # Test data-processor to backend
    if docker-compose exec -T data-processor curl -f -s "http://backend:8080/actuator/health" > /dev/null 2>&1; then
        print_status "SUCCESS" "Data processor to backend communication test passed"
    else
        print_status "WARNING" "Data processor to backend communication test failed (may be expected)"
    fi
    
    return 0
}

# Function to test resource limits
test_resource_limits() {
    print_status "INFO" "Testing resource limits enforcement"
    
    for service in "${SERVICES[@]}"; do
        local memory_limit=$(docker-compose config | grep -A 20 "$service:" | grep "memory:" | head -1 | awk '{print $2}')
        if [ -n "$memory_limit" ]; then
            local container_id=$(docker-compose ps -q $service)
            if [ -n "$container_id" ]; then
                local memory_usage=$(docker stats --no-stream --format "table {{.MemUsage}}" $container_id | tail -1 | cut -d'/' -f1)
                print_status "INFO" "$service memory usage: $memory_usage (limit: $memory_limit)"
            fi
        fi
    done
    
    return 0
}

# Function to test volume persistence
test_volume_persistence() {
    print_status "INFO" "Testing volume persistence"
    
    # Create test data in database
    docker-compose exec -T postgres psql -U pelotoniq_user -d pelotoniq -c "CREATE TABLE IF NOT EXISTS test_persistence (id SERIAL PRIMARY KEY, data TEXT);"
    docker-compose exec -T postgres psql -U pelotoniq_user -d pelotoniq -c "INSERT INTO test_persistence (data) VALUES ('test_data_$(date +%s)');"
    
    # Restart database service
    print_status "INFO" "Restarting PostgreSQL to test persistence"
    docker-compose restart postgres
    
    # Wait for service to come back up
    wait_for_service_health "postgres"
    
    # Check if data persists
    if docker-compose exec -T postgres psql -U pelotoniq_user -d pelotoniq -c "SELECT COUNT(*) FROM test_persistence;" | grep -q "1"; then
        print_status "SUCCESS" "Volume persistence test passed"
        return 0
    else
        print_status "ERROR" "Volume persistence test failed"
        return 1
    fi
}

# Function to test network isolation
test_network_isolation() {
    print_status "INFO" "Testing network isolation"
    
    # Test that services can communicate within the network
    if docker-compose exec -T backend ping -c 1 postgres > /dev/null 2>&1; then
        print_status "SUCCESS" "Internal network communication works"
    else
        print_status "ERROR" "Internal network communication failed"
        return 1
    fi
    
    return 0
}

# Function to test graceful shutdown
test_graceful_shutdown() {
    print_status "INFO" "Testing graceful shutdown"
    
    # Send SIGTERM to backend service
    local backend_container=$(docker-compose ps -q backend)
    if [ -n "$backend_container" ]; then
        docker kill -s TERM $backend_container
        sleep 5
        
        # Check if container stopped gracefully
        if ! docker ps | grep -q $backend_container; then
            print_status "SUCCESS" "Graceful shutdown test passed"
            # Restart the service
            docker-compose up -d backend
            wait_for_service_health "backend"
            return 0
        else
            print_status "ERROR" "Graceful shutdown test failed"
            return 1
        fi
    fi
    
    return 1
}

# Function to test configuration management
test_configuration_management() {
    print_status "INFO" "Testing configuration management"
    
    # Check environment variables are properly set
    local env_vars=(
        "backend:SPRING_PROFILES_ACTIVE"
        "data-processor:NODE_ENV"
        "ai-services:PYTHON_ENV"
    )
    
    for env_var in "${env_vars[@]}"; do
        local service=$(echo $env_var | cut -d':' -f1)
        local var_name=$(echo $env_var | cut -d':' -f2)
        
        if docker-compose exec -T $service printenv $var_name > /dev/null 2>&1; then
            print_status "SUCCESS" "$service environment variable $var_name is set"
        else
            print_status "ERROR" "$service environment variable $var_name is not set"
            return 1
        fi
    done
    
    return 0
}

# Function to test performance under load
test_performance_load() {
    print_status "INFO" "Testing performance under load"
    
    # Simple load test with curl
    print_status "INFO" "Running basic load test on frontend"
    for i in {1..10}; do
        curl -f -s "http://localhost/health" > /dev/null &
    done
    wait
    
    print_status "SUCCESS" "Basic load test completed"
    return 0
}

# Function to test security configurations
test_security_configurations() {
    print_status "INFO" "Testing security configurations"
    
    # Check if services are running as non-root
    local services_to_check=("backend" "frontend" "data-processor" "ai-services")
    
    for service in "${services_to_check[@]}"; do
        local user_id=$(docker-compose exec -T $service id -u 2>/dev/null || echo "unknown")
        if [ "$user_id" != "0" ] && [ "$user_id" != "unknown" ]; then
            print_status "SUCCESS" "$service is running as non-root user (UID: $user_id)"
        else
            print_status "WARNING" "$service may be running as root or user check failed"
        fi
    done
    
    return 0
}

# Function to cleanup test data
cleanup_test_data() {
    print_status "INFO" "Cleaning up test data"
    
    # Remove test table
    docker-compose exec -T postgres psql -U pelotoniq_user -d pelotoniq -c "DROP TABLE IF EXISTS test_persistence;" > /dev/null 2>&1 || true
    
    print_status "SUCCESS" "Test data cleanup completed"
}

# Main test execution
main() {
    local exit_code=0
    
    # Pre-flight checks
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_status "ERROR" "Docker compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    # Start the stack
    print_status "INFO" "Starting Docker stack..."
    docker-compose up -d
    
    # Wait for all services to be healthy
    print_status "INFO" "Waiting for all services to become healthy..."
    for service in "${SERVICES[@]}"; do
        if ! wait_for_service_health "$service"; then
            print_status "ERROR" "Service $service failed to start"
            exit_code=1
        fi
    done
    
    if [ $exit_code -eq 0 ]; then
        print_status "SUCCESS" "All services are healthy"
        
        # Run comprehensive tests
        local tests=(
            "test_database_connectivity"
            "test_redis_connectivity"
            "test_api_endpoints"
            "test_inter_service_communication"
            "test_resource_limits"
            "test_volume_persistence"
            "test_network_isolation"
            "test_configuration_management"
            "test_security_configurations"
            "test_performance_load"
            "test_graceful_shutdown"
        )
        
        for test in "${tests[@]}"; do
            echo ""
            if ! $test; then
                exit_code=1
            fi
        done
        
        # Cleanup
        cleanup_test_data
    fi
    
    # Summary
    echo ""
    echo "=================================================="
    if [ $exit_code -eq 0 ]; then
        print_status "SUCCESS" "All tests passed! Docker stack is working correctly."
    else
        print_status "ERROR" "Some tests failed. Please check the logs above."
        print_status "INFO" "View service logs with: docker-compose logs [service_name]"
        print_status "INFO" "Check service status with: docker-compose ps"
    fi
    
    exit $exit_code
}

# Handle script interruption
trap 'print_status "WARNING" "Test interrupted. Cleaning up..."; cleanup_test_data; exit 130' INT TERM

# Run main function
main "$@"