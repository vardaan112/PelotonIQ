package com.pelotoniq.cycling.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.pelotoniq.cycling.entity.Race;
import com.pelotoniq.cycling.entity.RaceCategory;
import com.pelotoniq.cycling.entity.RaceStatus;
import com.pelotoniq.cycling.entity.RaceType;
import com.pelotoniq.cycling.repository.RaceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureWebMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureWebMvc
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:testdb",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.datasource.username=sa",
    "spring.datasource.password="
})
class RaceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RaceRepository raceRepository;

    private ObjectMapper objectMapper;
    private Race testRace;
    private Race testRace2;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        testRace = new Race(
            "Tour de Test",
            "Annual cycling championship",
            LocalDate.of(2026, 7, 15),
            LocalTime.of(9, 0),
            "Paris",
            "France",
            RaceType.ROAD_RACE,
            RaceCategory.WORLD_TOUR
        );
        testRace.setId(1L);
        testRace.setDistanceKm(new BigDecimal("180.50"));
        testRace.setElevationGainM(2500);
        testRace.setMaxParticipants(150);
        testRace.setEntryFee(new BigDecimal("75.00"));
        testRace.setPrizeMoney(new BigDecimal("50000.00"));
        testRace.setRegistrationDeadline(LocalDate.of(2026, 6, 15));
        testRace.setRegistrationOpen(true);
        testRace.setStatus(RaceStatus.PLANNED);

        testRace2 = new Race(
            "Sprint Challenge",
            "High-speed criterium race",
            LocalDate.of(2026, 8, 20),
            LocalTime.of(14, 30),
            "London",
            "UK",
            RaceType.CRITERIUM,
            RaceCategory.AMATEUR
        );
        testRace2.setId(2L);
        testRace2.setDistanceKm(new BigDecimal("25.00"));
        testRace2.setElevationGainM(100);
        testRace2.setMaxParticipants(50);
        testRace2.setEntryFee(new BigDecimal("25.00"));
        testRace2.setPrizeMoney(new BigDecimal("5000.00"));
        testRace2.setRegistrationDeadline(LocalDate.of(2026, 7, 20));
        testRace2.setRegistrationOpen(true);
        testRace2.setStatus(RaceStatus.REGISTRATION_OPEN);
    }

    @Test
    void getAllRaces_ShouldReturnPagedResults() throws Exception {
        Pageable pageable = PageRequest.of(0, 20, Sort.by("raceDate").ascending());
        Page<Race> racePage = new PageImpl<>(Arrays.asList(testRace, testRace2), pageable, 2);
        
        when(raceRepository.findAll(any(Pageable.class))).thenReturn(racePage);

        mockMvc.perform(get("/races"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].name").value("Tour de Test"))
                .andExpect(jsonPath("$.content[1].name").value("Sprint Challenge"))
                .andExpect(jsonPath("$.totalElements").value(2));

        verify(raceRepository).findAll(any(Pageable.class));
    }

    @Test
    void getRaceById_ExistingRace_ShouldReturnRace() throws Exception {
        when(raceRepository.findById(1L)).thenReturn(Optional.of(testRace));

        mockMvc.perform(get("/races/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Tour de Test"))
                .andExpect(jsonPath("$.location").value("Paris"))
                .andExpect(jsonPath("$.raceType").value("ROAD_RACE"));

        verify(raceRepository).findById(1L);
    }

    @Test
    void getRaceById_NonExistingRace_ShouldReturn404() throws Exception {
        when(raceRepository.findById(999L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/races/999"))
                .andExpect(status().isNotFound());

        verify(raceRepository).findById(999L);
    }

    @Test
    void createRace_ValidRace_ShouldReturnCreatedRace() throws Exception {
        when(raceRepository.save(any(Race.class))).thenReturn(testRace);

        mockMvc.perform(post("/races")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRace)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Tour de Test"))
                .andExpect(jsonPath("$.location").value("Paris"));

        verify(raceRepository).save(any(Race.class));
    }

    @Test
    void updateRace_ExistingRace_ShouldReturnUpdatedRace() throws Exception {
        when(raceRepository.existsById(1L)).thenReturn(true);
        when(raceRepository.save(any(Race.class))).thenReturn(testRace);

        testRace.setName("Updated Tour de Test");

        mockMvc.perform(put("/races/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRace)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Tour de Test"));

        verify(raceRepository).existsById(1L);
        verify(raceRepository).save(any(Race.class));
    }

    @Test
    void deleteRace_ExistingRace_ShouldReturn204() throws Exception {
        when(raceRepository.existsById(1L)).thenReturn(true);

        mockMvc.perform(delete("/races/1"))
                .andExpect(status().isNoContent());

        verify(raceRepository).existsById(1L);
        verify(raceRepository).deleteById(1L);
    }

    @Test
    void searchRacesByName_ShouldReturnMatchingRaces() throws Exception {
        when(raceRepository.findByNameOrDescriptionContainingIgnoreCase("tour")).thenReturn(Arrays.asList(testRace));

        mockMvc.perform(get("/races/search").param("keyword", "tour"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Tour de Test"));

        verify(raceRepository).findByNameOrDescriptionContainingIgnoreCase("tour");
    }

    @Test
    void getRacesByLocation_ShouldReturnMatchingRaces() throws Exception {
        when(raceRepository.findByLocation("Paris")).thenReturn(Arrays.asList(testRace));

        mockMvc.perform(get("/races/location/Paris"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].location").value("Paris"));

        verify(raceRepository).findByLocation("Paris");
    }

    @Test
    void getRacesByType_ShouldReturnMatchingRaces() throws Exception {
        when(raceRepository.findByRaceType(RaceType.ROAD_RACE)).thenReturn(Arrays.asList(testRace));

        mockMvc.perform(get("/races/type/ROAD_RACE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].raceType").value("ROAD_RACE"));

        verify(raceRepository).findByRaceType(RaceType.ROAD_RACE);
    }

    @Test
    void getRacesByCategory_ShouldReturnMatchingRaces() throws Exception {
        when(raceRepository.findByCategory(RaceCategory.WORLD_TOUR)).thenReturn(Arrays.asList(testRace));

        mockMvc.perform(get("/races/category/WORLD_TOUR"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].category").value("WORLD_TOUR"));

        verify(raceRepository).findByCategory(RaceCategory.WORLD_TOUR);
    }

    @Test
    void getUpcomingRaces_ShouldReturnFutureRaces() throws Exception {
        when(raceRepository.findUpcomingRaces(any(LocalDate.class))).thenReturn(Arrays.asList(testRace, testRace2));

        mockMvc.perform(get("/races/upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(raceRepository).findUpcomingRaces(any(LocalDate.class));
    }

    @Test
    void getRacesByDistanceRange_ShouldReturnMatchingRaces() throws Exception {
        BigDecimal minDistance = new BigDecimal("100.0");
        BigDecimal maxDistance = new BigDecimal("200.0");
        when(raceRepository.findByDistanceRange(minDistance, maxDistance)).thenReturn(Arrays.asList(testRace));

        mockMvc.perform(get("/races/distance-range")
                .param("minDistance", "100.0")
                .param("maxDistance", "200.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1));

        verify(raceRepository).findByDistanceRange(minDistance, maxDistance);
    }

    @Test
    void getHighPrizeRaces_ShouldReturnHighPrizeRaces() throws Exception {
        when(raceRepository.findByMinimumPrizeMoney(new BigDecimal("10000"))).thenReturn(Arrays.asList(testRace));

        mockMvc.perform(get("/races/high-prize"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1));

        verify(raceRepository).findByMinimumPrizeMoney(new BigDecimal("10000"));
    }

    @Test
    void getRacesWithAvailableSpots_ShouldReturnAvailableRaces() throws Exception {
        when(raceRepository.findRacesWithAvailableSpots()).thenReturn(Arrays.asList(testRace, testRace2));

        mockMvc.perform(get("/races/available-spots"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(raceRepository).findRacesWithAvailableSpots();
    }

    @Test
    void getCountByType_ShouldReturnStatistics() throws Exception {
        List<Object[]> stats = Arrays.asList(
            new Object[]{RaceType.ROAD_RACE, 5L},
            new Object[]{RaceType.CRITERIUM, 3L}
        );
        when(raceRepository.findRaceTypeCountsByYear(2026)).thenReturn(stats);

        mockMvc.perform(get("/races/statistics/count-by-type"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(raceRepository).findRaceTypeCountsByYear(2026);
    }

    @Test
    void getAverageDistanceByType_ShouldReturnAverage() throws Exception {
        when(raceRepository.findAverageDistanceByRaceType(RaceType.ROAD_RACE)).thenReturn(new BigDecimal("102.75"));

        mockMvc.perform(get("/races/statistics/average-distance-by-type")
                .param("raceType", "ROAD_RACE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(102.75));

        verify(raceRepository).findAverageDistanceByRaceType(RaceType.ROAD_RACE);
    }

    @Test
    void getActiveUpcomingRaces_ShouldReturnActiveRaces() throws Exception {
        when(raceRepository.findActiveUpcomingRaces(any(LocalDate.class))).thenReturn(Arrays.asList(testRace, testRace2));

        mockMvc.perform(get("/races/active-upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(raceRepository).findActiveUpcomingRaces(any(LocalDate.class));
    }
}