import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockRefreshTokenRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    create: jest.fn(),
    findByEmail: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return user if credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      const mockUser = {
        id: '1',
        email,
        password: hashedPassword,
        isActive: true,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.validateUser(email, password);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        isActive: mockUser.isActive,
      });
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(email);
    });

    it('should return null if user not found', async () => {
      mockUsersService.findByEmail = jest.fn().mockResolvedValue(null);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should return null if password is incorrect', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: true,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await service.validateUser('test@example.com', 'wrong');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access token and refresh token on successful login', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: true,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockJwtService.sign.mockReturnValue('access-token');
      mockRefreshTokenRepository.save.mockResolvedValue({
        id: 'token-id',
        token: 'refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should return new access token if refresh token is valid', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
      };

      const mockRefreshToken = {
        id: 'token-id',
        token: 'refresh-token',
        user: mockUser,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockRefreshTokenRepository.findOne.mockResolvedValue(mockRefreshToken);
      mockJwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refreshToken('refresh-token');

      expect(result).toHaveProperty('access_token', 'new-access-token');
      expect(mockRefreshTokenRepository.findOne).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
        relations: ['user'],
      });
    });

    it('should throw UnauthorizedException if refresh token not found', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if refresh token expired', async () => {
      const mockRefreshToken = {
        id: 'token-id',
        token: 'refresh-token',
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      mockRefreshTokenRepository.findOne.mockResolvedValue(mockRefreshToken);

      await expect(service.refreshToken('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

