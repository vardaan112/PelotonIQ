package com.pelotoniq.cycling.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pelotoniq.cycling.entity.Rider;
import com.pelotoniq.cycling.entity.RiderSpecialization;
import com.pelotoniq.cycling.repository.RiderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(RiderController.class)
@ActiveProfiles("test")
@DisplayName("RiderController Tests")
class RiderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RiderRepository riderRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private Rider testRider1;
    private Rider testRider2;
    private List<Rider> testRiders;

    @BeforeEach
    void setUp() {
        testRider1 = new Rider("John", "Doe", "john.doe@example.com",
                             LocalDate.of(1995, 5, 15), "USA", "Team Sky", RiderSpecialization.SPRINTER);
        testRider1.setId(1L);
        testRider1.setHeightCm(180);
        testRider1.setWeightKg(75);
        testRider1.setFtpWatts(350.0);
        testRider1.setActive(true);

        testRider2 = new Rider("Jane", "Smith", "jane.smith@example.com",
                             LocalDate.of(1992, 8, 22), "UK", "Team Ineos", RiderSpecialization.CLIMBER);
        testRider2.setId(2L);
        testRider2.setHeightCm(165);
        testRider2.setWeightKg(58);
        testRider2.setFtpWatts(320.0);
        testRider2.setActive(true);

        testRiders = Arrays.asList(testRider1, testRider2);
    }

    @Test
    @DisplayName("Should get all riders with pagination")
    void shouldGetAllRidersWithPagination() throws Exception {
        Page<Rider> ridersPage = new PageImpl<>(testRiders, PageRequest.of(0, 20), testRiders.size());
        when(riderRepository.findAll(any(Pageable.class))).thenReturn(ridersPage);

        mockMvc.perform(get("/riders")
                .param("page", "0")
                .param("size", "20")
                .param("sortBy", "id")
                .param("sortDir", "asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].firstName").value("John"))
                .andExpect(jsonPath("$.content[1].firstName").value("Jane"))
                .andExpect(jsonPath("$.totalElements").value(2));

        verify(riderRepository).findAll(any(Pageable.class));
    }

    @Test
    @DisplayName("Should get rider by ID")
    void shouldGetRiderById() throws Exception {
        when(riderRepository.findById(1L)).thenReturn(Optional.of(testRider1));

        mockMvc.perform(get("/riders/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.firstName").value("John"))
                .andExpect(jsonPath("$.lastName").value("Doe"))
                .andExpect(jsonPath("$.email").value("john.doe@example.com"));

        verify(riderRepository).findById(1L);
    }

    @Test
    @DisplayName("Should return 404 when rider not found by ID")
    void shouldReturn404WhenRiderNotFoundById() throws Exception {
        when(riderRepository.findById(999L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/riders/999"))
                .andExpect(status().isNotFound());

        verify(riderRepository).findById(999L);
    }

    @Test
    @DisplayName("Should get rider by email")
    void shouldGetRiderByEmail() throws Exception {
        when(riderRepository.findByEmail("john.doe@example.com")).thenReturn(Optional.of(testRider1));

        mockMvc.perform(get("/riders/email/john.doe@example.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("john.doe@example.com"))
                .andExpect(jsonPath("$.firstName").value("John"));

        verify(riderRepository).findByEmail("john.doe@example.com");
    }

    @Test
    @DisplayName("Should return 404 when rider not found by email")
    void shouldReturn404WhenRiderNotFoundByEmail() throws Exception {
        when(riderRepository.findByEmail("nonexistent@example.com")).thenReturn(Optional.empty());

        mockMvc.perform(get("/riders/email/nonexistent@example.com"))
                .andExpect(status().isNotFound());

        verify(riderRepository).findByEmail("nonexistent@example.com");
    }

    @Test
    @DisplayName("Should get active riders")
    void shouldGetActiveRiders() throws Exception {
        Page<Rider> ridersPage = new PageImpl<>(testRiders, PageRequest.of(0, 20), testRiders.size());
        when(riderRepository.findByActiveTrue(any(Pageable.class))).thenReturn(ridersPage);

        mockMvc.perform(get("/riders/active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(2));

        verify(riderRepository).findByActiveTrue(any(Pageable.class));
    }

    @Test
    @DisplayName("Should get inactive riders")
    void shouldGetInactiveRiders() throws Exception {
        when(riderRepository.findByActiveFalse()).thenReturn(Arrays.asList());

        mockMvc.perform(get("/riders/inactive"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));

        verify(riderRepository).findByActiveFalse();
    }

    @Test
    @DisplayName("Should get riders by team")
    void shouldGetRidersByTeam() throws Exception {
        Page<Rider> ridersPage = new PageImpl<>(Arrays.asList(testRider1), PageRequest.of(0, 20), 1);
        when(riderRepository.findByTeam(eq("Team Sky"), any(Pageable.class))).thenReturn(ridersPage);

        mockMvc.perform(get("/riders/team/Team Sky"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].team").value("Team Sky"));

        verify(riderRepository).findByTeam(eq("Team Sky"), any(Pageable.class));
    }

    @Test
    @DisplayName("Should get riders by nationality")
    void shouldGetRidersByNationality() throws Exception {
        Page<Rider> ridersPage = new PageImpl<>(Arrays.asList(testRider1), PageRequest.of(0, 20), 1);
        when(riderRepository.findByNationality(eq("USA"), any(Pageable.class))).thenReturn(ridersPage);

        mockMvc.perform(get("/riders/nationality/USA"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].nationality").value("USA"));

        verify(riderRepository).findByNationality(eq("USA"), any(Pageable.class));
    }

    @Test
    @DisplayName("Should get riders by specialization")
    void shouldGetRidersBySpecialization() throws Exception {
        Page<Rider> ridersPage = new PageImpl<>(Arrays.asList(testRider1), PageRequest.of(0, 20), 1);
        when(riderRepository.findBySpecialization(eq(RiderSpecialization.SPRINTER), any(Pageable.class))).thenReturn(ridersPage);

        mockMvc.perform(get("/riders/specialization/SPRINTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].specialization").value("SPRINTER"));

        verify(riderRepository).findBySpecialization(eq(RiderSpecialization.SPRINTER), any(Pageable.class));
    }

    @Test
    @DisplayName("Should search riders by name")
    void shouldSearchRidersByName() throws Exception {
        when(riderRepository.findByNameContainingIgnoreCase("john")).thenReturn(Arrays.asList(testRider1));

        mockMvc.perform(get("/riders/search")
                .param("name", "john"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].firstName").value("John"));

        verify(riderRepository).findByNameContainingIgnoreCase("john");
    }

    @Test
    @DisplayName("Should get riders by age range")
    void shouldGetRidersByAgeRange() throws Exception {
        when(riderRepository.findByAgeBetween(25, 35)).thenReturn(testRiders);

        mockMvc.perform(get("/riders/age-range")
                .param("minAge", "25")
                .param("maxAge", "35"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(riderRepository).findByAgeBetween(25, 35);
    }

    @Test
    @DisplayName("Should get riders by birth date range")
    void shouldGetRidersByBirthDateRange() throws Exception {
        when(riderRepository.findByDateOfBirthBetween(any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(testRiders);

        mockMvc.perform(get("/riders/birth-date-range")
                .param("startDate", "1990-01-01")
                .param("endDate", "1999-12-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(riderRepository).findByDateOfBirthBetween(any(LocalDate.class), any(LocalDate.class));
    }

    @Test
    @DisplayName("Should get riders by minimum FTP")
    void shouldGetRidersByMinimumFtp() throws Exception {
        when(riderRepository.findByFtpWattsGreaterThanEqual(300.0)).thenReturn(testRiders);

        mockMvc.perform(get("/riders/ftp/min/300.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(riderRepository).findByFtpWattsGreaterThanEqual(300.0);
    }

    @Test
    @DisplayName("Should get top riders by FTP")
    void shouldGetTopRidersByFtp() throws Exception {
        when(riderRepository.findTopRidersByFtp(any(Pageable.class))).thenReturn(testRiders);

        mockMvc.perform(get("/riders/top-ftp")
                .param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));

        verify(riderRepository).findTopRidersByFtp(any(Pageable.class));
    }

    @Test
    @DisplayName("Should get active rider count by team")
    void shouldGetActiveRiderCountByTeam() throws Exception {
        when(riderRepository.countActiveRidersByTeam("Team Sky")).thenReturn(5L);

        mockMvc.perform(get("/riders/stats/team/Team Sky/count"))
                .andExpect(status().isOk())
                .andExpect(content().string("5"));

        verify(riderRepository).countActiveRidersByTeam("Team Sky");
    }

    @Test
    @DisplayName("Should get average FTP by team")
    void shouldGetAverageFtpByTeam() throws Exception {
        when(riderRepository.findAverageFtpByTeam("Team Sky")).thenReturn(365.5);

        mockMvc.perform(get("/riders/stats/team/Team Sky/average-ftp"))
                .andExpect(status().isOk())
                .andExpect(content().string("365.5"));

        verify(riderRepository).findAverageFtpByTeam("Team Sky");
    }

    @Test
    @DisplayName("Should return no content when average FTP is null")
    void shouldReturnNoContentWhenAverageFtpIsNull() throws Exception {
        when(riderRepository.findAverageFtpByTeam("NonExistent Team")).thenReturn(null);

        mockMvc.perform(get("/riders/stats/team/NonExistent Team/average-ftp"))
                .andExpect(status().isNoContent());

        verify(riderRepository).findAverageFtpByTeam("NonExistent Team");
    }

    @Test
    @DisplayName("Should create new rider")
    void shouldCreateNewRider() throws Exception {
        Rider newRider = new Rider("Alice", "Johnson", "alice.johnson@example.com",
                                 LocalDate.of(1994, 3, 10), "Canada", "Team Jumbo", RiderSpecialization.ALL_ROUNDER);
        
        when(riderRepository.existsByEmail("alice.johnson@example.com")).thenReturn(false);
        when(riderRepository.save(any(Rider.class))).thenReturn(newRider);

        mockMvc.perform(post("/riders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newRider)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.firstName").value("Alice"))
                .andExpect(jsonPath("$.email").value("alice.johnson@example.com"));

        verify(riderRepository).existsByEmail("alice.johnson@example.com");
        verify(riderRepository).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should return conflict when creating rider with existing email")
    void shouldReturnConflictWhenCreatingRiderWithExistingEmail() throws Exception {
        when(riderRepository.existsByEmail("john.doe@example.com")).thenReturn(true);

        mockMvc.perform(post("/riders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRider1)))
                .andExpect(status().isConflict());

        verify(riderRepository).existsByEmail("john.doe@example.com");
        verify(riderRepository, never()).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should return bad request when creating rider with invalid data")
    void shouldReturnBadRequestWhenCreatingRiderWithInvalidData() throws Exception {
        Rider invalidRider = new Rider();
        invalidRider.setEmail("invalid-email");

        mockMvc.perform(post("/riders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidRider)))
                .andExpect(status().isBadRequest());

        verify(riderRepository, never()).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should update existing rider")
    void shouldUpdateExistingRider() throws Exception {
        testRider1.setFirstName("Jonathan");
        
        when(riderRepository.existsById(1L)).thenReturn(true);
        when(riderRepository.findByEmail("john.doe@example.com")).thenReturn(Optional.of(testRider1));
        when(riderRepository.save(any(Rider.class))).thenReturn(testRider1);

        mockMvc.perform(put("/riders/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRider1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("Jonathan"));

        verify(riderRepository).existsById(1L);
        verify(riderRepository).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should return 404 when updating non-existent rider")
    void shouldReturn404WhenUpdatingNonExistentRider() throws Exception {
        when(riderRepository.existsById(999L)).thenReturn(false);

        mockMvc.perform(put("/riders/999")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRider1)))
                .andExpect(status().isNotFound());

        verify(riderRepository).existsById(999L);
        verify(riderRepository, never()).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should return conflict when updating rider email to existing email")
    void shouldReturnConflictWhenUpdatingRiderEmailToExistingEmail() throws Exception {
        when(riderRepository.existsById(1L)).thenReturn(true);
        when(riderRepository.findByEmail("jane.smith@example.com")).thenReturn(Optional.of(testRider2));

        testRider1.setEmail("jane.smith@example.com");

        mockMvc.perform(put("/riders/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(testRider1)))
                .andExpect(status().isConflict());

        verify(riderRepository).existsById(1L);
        verify(riderRepository).findByEmail("jane.smith@example.com");
        verify(riderRepository, never()).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should activate rider")
    void shouldActivateRider() throws Exception {
        testRider1.setActive(false);
        when(riderRepository.findById(1L)).thenReturn(Optional.of(testRider1));
        when(riderRepository.save(any(Rider.class))).thenAnswer(invocation -> {
            Rider rider = invocation.getArgument(0);
            rider.setActive(true);
            return rider;
        });

        mockMvc.perform(patch("/riders/1/activate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));

        verify(riderRepository).findById(1L);
        verify(riderRepository).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should deactivate rider")
    void shouldDeactivateRider() throws Exception {
        when(riderRepository.findById(1L)).thenReturn(Optional.of(testRider1));
        when(riderRepository.save(any(Rider.class))).thenAnswer(invocation -> {
            Rider rider = invocation.getArgument(0);
            rider.setActive(false);
            return rider;
        });

        mockMvc.perform(patch("/riders/1/deactivate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        verify(riderRepository).findById(1L);
        verify(riderRepository).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should return 404 when activating non-existent rider")
    void shouldReturn404WhenActivatingNonExistentRider() throws Exception {
        when(riderRepository.findById(999L)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/riders/999/activate"))
                .andExpect(status().isNotFound());

        verify(riderRepository).findById(999L);
        verify(riderRepository, never()).save(any(Rider.class));
    }

    @Test
    @DisplayName("Should delete rider")
    void shouldDeleteRider() throws Exception {
        when(riderRepository.existsById(1L)).thenReturn(true);

        mockMvc.perform(delete("/riders/1"))
                .andExpect(status().isNoContent());

        verify(riderRepository).existsById(1L);
        verify(riderRepository).deleteById(1L);
    }

    @Test
    @DisplayName("Should return 404 when deleting non-existent rider")
    void shouldReturn404WhenDeletingNonExistentRider() throws Exception {
        when(riderRepository.existsById(999L)).thenReturn(false);

        mockMvc.perform(delete("/riders/999"))
                .andExpect(status().isNotFound());

        verify(riderRepository).existsById(999L);
        verify(riderRepository, never()).deleteById(999L);
    }

    @Test
    @DisplayName("Should check email existence")
    void shouldCheckEmailExistence() throws Exception {
        when(riderRepository.existsByEmail("john.doe@example.com")).thenReturn(true);

        mockMvc.perform(get("/riders/check-email")
                .param("email", "john.doe@example.com"))
                .andExpect(status().isOk())
                .andExpect(content().string("true"));

        verify(riderRepository).existsByEmail("john.doe@example.com");
    }

    @Test
    @DisplayName("Should return false for non-existent email")
    void shouldReturnFalseForNonExistentEmail() throws Exception {
        when(riderRepository.existsByEmail("nonexistent@example.com")).thenReturn(false);

        mockMvc.perform(get("/riders/check-email")
                .param("email", "nonexistent@example.com"))
                .andExpect(status().isOk())
                .andExpect(content().string("false"));

        verify(riderRepository).existsByEmail("nonexistent@example.com");
    }
}