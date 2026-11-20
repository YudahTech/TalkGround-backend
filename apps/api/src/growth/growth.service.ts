import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SurveyResponseDto, WaitlistDto } from './growth.dto';

@Injectable()
export class GrowthService {
  constructor(private prisma: PrismaService) {}

  async submitSurvey(dto: SurveyResponseDto) {
    const response = await this.prisma.surveyResponse.create({
      data: {
        answers: dto.answers as Prisma.InputJsonValue,
        email: dto.email,
        city: dto.city,
      },
    });
    return {
      data: { id: response.id, message: 'Survey submitted. Thank you.' },
    };
  }

  async joinWaitlist(dto: WaitlistDto) {
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already on waitlist');
    }

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        city: dto.city.trim().toLowerCase(),
        primaryUse: dto.primaryUse,
        attribution: dto.attribution,
        consentGiven: dto.consentGiven,
      },
    });

    return { data: { id: entry.id, message: "You're on the list." } };
  }

  async waitlistStats() {
    const [total, byCity] = await Promise.all([
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.groupBy({
        by: ['city'],
        _count: { _all: true },
      }),
    ]);
    return {
      data: {
        total,
        byCity: Object.fromEntries(byCity.map((c) => [c.city, c._count._all])),
      },
    };
  }
}
